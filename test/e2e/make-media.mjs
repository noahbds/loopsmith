// Generates the test media with ffmpeg (once; the files are not committed).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function makeMedia(dir) {
  const ff = (out, args) => {
    if (existsSync(join(dir, out))) return;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, join(dir, out)]);
  };
  try {
    ff('main.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '60',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', '300k', '-c:a', 'aac', '-shortest', '-movflags', '+faststart']);
    ff('bg.mp4', ['-f', 'lavfi', '-i', 'color=c=0x335577:size=320x180:rate=10', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
    ff('song.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '40', '-c:a', 'libmp3lame']);
  } catch (e) {
    throw new Error('ffmpeg is needed to generate the test media (brew install ffmpeg): ' + e.message);
  }
}
