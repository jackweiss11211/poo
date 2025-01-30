const express = require('express');
const Pornsearch = require('pornsearch');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

app.post('/search', async (req, res) => {
  const { query } = req.body;
  const searcher = new Pornsearch(query);

  try {
    const videos = await searcher.videos();
    const videoUrls = videos.map(video => video.url);

    // Filter out invalid URLs
    const validVideoUrls = videoUrls.filter(url => url && !url.includes('undefined') && !url.includes('javascript:void(0)'));

    // Log the valid video URLs for debugging
    console.log('Valid Video URLs:', validVideoUrls);

    const zipPath = path.join(__dirname, 'videos.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.pipe(output);

    for (const url of validVideoUrls) {
      const response = await axios({ url, responseType: 'stream' });
      archive.append(response.data, { name: path.basename(url) });
    }

    await archive.finalize();
    res.download(zipPath, 'videos.zip', (err) => {
      if (err) {
        console.error('Error downloading zip:', err);
      }
      fs.unlink(zipPath, () => {});
    });
  } catch (error) {
    console.error('Error during search or download:', error);
    res.status(500).send('An error occurred during search or download.');
  }
});

// Serve index.html for any unknown routes (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
