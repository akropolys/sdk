import { useCallback, useEffect, useState } from 'react';
import { useAkropolysContext } from '../Provider';

export interface UseAllowanceReturn {
  images: number;
  videos: number;
  voiceSeconds: number;
  replies: number;
  loaded: boolean;
  refresh: () => Promise<void>;
}

export function useAllowance(): UseAllowanceReturn {
  const client = useAkropolysContext();
  const [images, setImages] = useState(-1);
  const [videos, setVideos] = useState(-1);
  const [voiceSeconds, setVoiceSeconds] = useState(-1);
  const [replies, setReplies] = useState(-1);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const res = await client.allowance();
      setImages(res.images);
      setVideos(res.videos);
      setVoiceSeconds(res.voiceSeconds);
      setReplies(res.replies);
      setLoaded(true);
    } catch {
      // A balance we cannot read is one the shopper simply is not shown.
    }
  }, [client]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { images, videos, voiceSeconds, replies, loaded, refresh };
}
