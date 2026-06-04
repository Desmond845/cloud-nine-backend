import express from 'express';
import { spawn } from 'child_process';
import yts from 'yt-search';

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

async function findBestVideo(songTitle, artistName) {
  const query = `${artistName} ${songTitle} official audio`;
  console.log(`Searching: "${query}"`);
  
  const results = await yts(query);
  if (!results.videos.length) return null;

  const videos = results.videos.slice(0, 8);
  let bestVideo = videos[0];
  let bestScore = -1;

  videos.forEach((video, index) => {
    let score = 0;
    const title   = video.title.toLowerCase();
    const channel = video.author.name.toLowerCase();
    const artist  = artistName.toLowerCase();
    const song    = songTitle.toLowerCase();
  
    score += Math.max(0, 8 - index);

    if (title.includes(song)) score += 6;

    const artistWords = artist.split(' ');
    const channelMatchCount = artistWords.filter(w => 
      w.length > 2 && channel.includes(w)
    ).length;
    score += channelMatchCount * 4;

    // Official markers
    if (title.includes('official audio')) score += 10;
    if (title.includes('[audio]'))        score += 9;
    if (title.includes('official music')) score += 8;
    if (title.includes('lyric video'))    score += 6;
    if (title.includes('official'))       score += 4;
    if (title.includes('audio'))          score += 3;

    
    const isCover = title.includes('cover') || title.includes('remix');
    const wantsCover = song.includes('cover') || song.includes('remix');
    if (isCover && !wantsCover) score -= 8;

    console.log(`  [${index}] score ${score} — ${video.title}`);

    if (score > bestScore) {
      bestScore = score;
      bestVideo = video;
    }
  });

  console.log(`Selected: "${bestVideo.title}"`);
  return bestVideo;
}

app.get('/search', async (req, res) => {
  const song   = req.query.song   || req.query.q || '';
  const artist = req.query.artist || '';

  if (!song) return res.status(400).json({ error: 'Missing song parameter' });

  try {
    const video = await findBestVideo(song, artist);
    if (!video) return res.status(404).json({ error: 'No video found' });

    res.json({
      success:   true,
      videoId:   video.videoId,
      title:     video.title,
      artist:    video.author.name,
      thumbnail: video.thumbnail,
      duration:  video.duration.seconds
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream', (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).json({ error: 'Missing id' });

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`Streaming: ${url}`);

  const yt = spawn('yt-dlp', [
    '-f', 'bestaudio',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '-o', '-',
    url
  ]);

  res.setHeader('Content-Type', 'audio/mpeg');
  yt.stdout.pipe(res);
  yt.stderr.on('data', d => {
    const s = d.toString();
    if (!s.includes('WARNING')) console.error(s);
  });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Cloud Nine running on :${PORT}`));
