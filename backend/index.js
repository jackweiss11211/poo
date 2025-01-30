const express = require('express');
const PornhubAPI = require('@justalk/pornhub-api');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pornhub = new PornhubAPI();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());

app.post('/search', async (req, res) => {
  const { query } = req.body;

  try {
    const results = await pornhub.searchVideos(query);
    const videoLinks = results.map(video => video.download_urls);

    // Log the video download links for debugging
    console.log('Video Download Links:', videoLinks);

    const zipPath = path.join(__dirname, 'videos.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.pipe(output);

    for (const links of videoLinks) {
      for (const url of links) {
        const response = await axios({ url, responseType: 'stream' });
        archive.append(response.data, { name: path.basename(url) });
      }
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
