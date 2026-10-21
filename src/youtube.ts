import { CallLimit, QuotaBudget, type QuotaOp } from './core/quota';

const BASE = 'https://www.googleapis.com/youtube/v3';

export type SearchHit = { channelId: string; channelTitle: string };
export type ChannelInfo = { id: string; title: string; thumb: string | null; uploads: string; subscribers: number; videoCount: number };
export type PlaylistVideo = { id: string; title: string; description: string; publishedAt: number };
export type VideoDetails = { id: string; duration: string; embedWidth?: number; embedHeight?: number; views?: number; likes?: number };

// Google's search bucket ran out (or was refused). Discovery waits for tomorrow; everything else carries on.
export class SearchUnavailable extends Error {}

export class YouTube {
  constructor(private key: string, private budget: QuotaBudget, private calls: CallLimit) {}

  private async get<T>(op: QuotaOp, path: string, params: Record<string, string>): Promise<T> {
    this.calls.take();
    this.budget.spend(op); // throws QuotaExceeded before any call we can't afford
    const qs = new URLSearchParams({ ...params, key: this.key });
    const res = await fetch(`${BASE}/${path}?${qs}`);
    if (!res.ok) {
      const msg = `YouTube ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`;
      throw op === 'search' && (res.status === 429 || res.status === 403) ? new SearchUnavailable(msg) : new Error(msg);
    }
    return res.json() as Promise<T>;
  }

  async searchShorts(q: string, lang: 'en' | 'hi', publishedAfterDays: number, videoDuration: 'short' | 'medium' = 'short'): Promise<SearchHit[]> {
    const data = await this.get<{ items: { snippet: { channelId: string; channelTitle: string } }[] }>('search', 'search', {
      part: 'snippet', type: 'video', videoDuration, maxResults: '50', q,
      relevanceLanguage: lang, regionCode: 'IN', safeSearch: 'moderate',
      publishedAfter: new Date(Date.now() - publishedAfterDays * 86_400_000).toISOString(),
    });
    return data.items.map((i) => ({ channelId: i.snippet.channelId, channelTitle: i.snippet.channelTitle }));
  }

  async channels(ids: string[]): Promise<ChannelInfo[]> {
    const out: ChannelInfo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get<{ items?: any[] }>('channels', 'channels', {
        part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50',
      });
      for (const c of data.items ?? []) {
        const uploads = c.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) continue;
        out.push({
          id: c.id, title: c.snippet.title, thumb: c.snippet.thumbnails?.default?.url ?? null, uploads,
          subscribers: Number(c.statistics?.subscriberCount ?? 0), videoCount: Number(c.statistics?.videoCount ?? 0),
        });
      }
    }
    return out;
  }

  async latestUploads(playlistId: string, max = 10): Promise<PlaylistVideo[]> {
    const data = await this.get<{ items?: any[] }>('playlistItems', 'playlistItems', {
      part: 'snippet,contentDetails', playlistId, maxResults: String(max),
    });
    return (data.items ?? []).map((i) => ({
      id: i.contentDetails.videoId,
      title: i.snippet.title,
      description: i.snippet.description ?? '',
      publishedAt: Date.parse(i.contentDetails.videoPublishedAt ?? i.snippet.publishedAt),
    }));
  }

  // maxHeight makes the API return the embed's width/height, which tells us vertical vs horizontal.
  async videoDetails(ids: string[]): Promise<VideoDetails[]> {
    const out: VideoDetails[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.get<{ items?: any[] }>('videos', 'videos', {
        part: 'contentDetails,player,statistics', id: ids.slice(i, i + 50).join(','), maxHeight: '640',
      });
      for (const v of data.items ?? []) {
        out.push({ id: v.id, duration: v.contentDetails.duration, embedWidth: Number(v.player?.embedWidth) || undefined,
          embedHeight: Number(v.player?.embedHeight) || undefined,
          views: Number(v.statistics?.viewCount) || undefined,
          likes: v.statistics?.likeCount != null ? Number(v.statistics.likeCount) : undefined });
      }
    }
    return out;
  }
}
