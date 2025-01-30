const express = require('express');
const pornhub = require('@justalk/pornhub-api');
const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
  MAX_VIDEOS: 10,           // Limit total videos per search
  MAX_VIDEO_SIZE: 500 * 1024 * 1024, // 500MB per video
  DOWNLOAD_TIMEOUT: 30000,  // 30 seconds
  DOWNLOADS_DIR: path.join(__dirname, 'downloads')
};

// Ensure downloads directory exists
if (!fs.existsSync(CONFIG.DOWNLOADS_DIR)) {
  fs.mkdirSync(CONFIG.DOWNLOADS_DIR);
}

app.use(express.json());

// Middleware for input validation
const validateSearchQuery = (req, res, next) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ 
      error: 'Invalid search query. Must be a non-empty string.' 
    });
  }

  if (query.length < 2 || query.length > 100) {
    return res.status(400).json({ 
      error: 'Search query must be between 2 and 100 characters.' 
    });
  }

  next();
};

app.post('/search', validateSearchQuery, async (req, res) => {
  const { query } = req.body;

  try {
    console.log('Searching with query:', query);
    
    // Search for videos with download URLs
    const searchResults = await pornhub.search(query, ['link', 'title', 'download_urls']);
    
    console.log('Raw search results:', JSON.stringify(searchResults, null, 2));

    // Extract results from the response object
    const results = searchResults.results || [];

    // Limit number of videos
    const limitedResults = results.slice(0, CONFIG.MAX_VIDEOS);

    // Prepare zip file
    const zipPath = path.join(CONFIG.DOWNLOADS_DIR, `videos_${Date.now()}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.pipe(output);

    // Track download progress
    let downloadedVideos = 0;
    let failedVideos = 0;
    let totalDownloadSize = 0;

    // Download videos
    for (const video of limitedResults) {
      // Skip premium videos
      if (video.premium) {
        console.log(`Skipping premium video: ${video.title}`);
        continue;
      }

      // Fetch video page to get download URLs
      try {
        const videoDetails = await pornhub.page(video.link, ['download_urls']);
        
        if (videoDetails.download_urls) {
          // Prefer highest quality download URL
          const downloadUrl = Object.values(videoDetails.download_urls)[0];
          
          const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            timeout: CONFIG.DOWNLOAD_TIMEOUT,
            maxContentLength: CONFIG.MAX_VIDEO_SIZE
          });

          // Check content length
          const contentLength = parseInt(response.headers['content-length'], 10) || 0;
          totalDownloadSize += contentLength;

          if (totalDownloadSize > CONFIG.MAX_VIDEO_SIZE * CONFIG.MAX_VIDEOS) {
            console.warn('Total download size exceeded limit');
            break;
          }

          // Create a sanitized filename
          const sanitizedTitle = video.title
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()
            .substring(0, 50);
          
          // Add video to zip
          archive.append(response.data, { 
            name: `${sanitizedTitle}_${downloadedVideos + 1}.mp4` 
          });
          
          downloadedVideos++;
        }
      } catch (videoError) {
        console.error(`Failed to process video: ${video.title}`, videoError.message);
        failedVideos++;
      }
    }

    // Finalize the archive
    await archive.finalize();

    // Send the zip file
    res.download(zipPath, `videos_${Date.now()}.zip`, (err) => {
      if (err) {
        console.error('Error sending zip:', err);
      }
      
      // Clean up the zip file after sending
      fs.unlink(zipPath, () => {});
    });

    console.log(`Download complete. Total videos: ${downloadedVideos}, Failed: ${failedVideos}`);

  } catch (error) {
    console.error('Comprehensive Error during search or download:', error);
    res.status(500).send(`An error occurred: ${error.message}`);
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for any unknown routes (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
