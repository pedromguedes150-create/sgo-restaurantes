import { describe, it, expect } from 'vitest';
import { youtubeId, youtubeEmbedUrl } from '@/lib/youtube';

describe('youtube parser', () => {
  it('extrai id de formatos comuns', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
    expect(youtubeId('https://youtu.be/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
    expect(youtubeId('https://www.youtube.com/embed/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
    expect(youtubeId('https://www.youtube.com/shorts/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
    expect(youtubeId('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30s')).toBe('aqz-KE-bpKQ');
    expect(youtubeId('aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
  });
  it('rejeita url inválida', () => {
    expect(youtubeId('https://vimeo.com/12345')).toBeNull();
    expect(youtubeEmbedUrl('texto qualquer')).toBeNull();
  });
  it('monta url de embed', () => {
    expect(youtubeEmbedUrl('https://youtu.be/aqz-KE-bpKQ')).toBe('https://www.youtube.com/embed/aqz-KE-bpKQ');
  });
});
