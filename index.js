require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const DEEZER_ARL = process.env.DEEZER_ARL || '';

app.use(cors());
app.use(express.json());

// Helper function to create authenticated Deezer API headers/cookies
const getDeezerHeaders = () => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
  if (DEEZER_ARL) {
    headers['Cookie'] = `arl=${DEEZER_ARL.trim()}`;
  }
  return headers;
};

// GET / - Root Health Check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Deezer Audio Backend API',
    arlConfigured: Boolean(DEEZER_ARL),
    endpoints: {
      search: '/api/search?q=query',
      download: '/api/download/:id',
      songs: '/songs',
    },
  });
});

// GET /songs - Default tracks for mobile client initialization
app.get('/songs', async (req, res) => {
  try {
    const response = await axios.get('https://api.deezer.com/chart/0/tracks?limit=25');
    const tracks = (response.data?.data || []).map((track) => ({
      id: String(track.id),
      title: track.title || 'Canción Desconocida',
      artist: track.artist?.name || 'Artista Desconocido',
      artwork:
        track.album?.cover_xl ||
        track.album?.cover_big ||
        track.album?.cover_medium ||
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80',
      duration: track.duration || 0,
      url: `/api/download/${track.id}`,
      preview: track.preview,
    }));
    res.json(tracks);
  } catch (error) {
    console.error('Error fetching chart songs:', error.message);
    res.status(500).json({ error: 'Error al obtener la lista de canciones' });
  }
});

// GET /api/search?q=query - Deezer Track Search
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Parámetro de búsqueda "q" requerido' });
  }

  try {
    const response = await axios.get(
      `https://api.deezer.com/search?q=${encodeURIComponent(String(query))}`,
      { headers: getDeezerHeaders() }
    );

    const tracks = (response.data?.data || []).map((track) => ({
      id: String(track.id),
      title: track.title,
      artist: track.artist?.name || 'Artista Desconocido',
      album: track.album?.title || '',
      artwork:
        track.album?.cover_xl ||
        track.album?.cover_big ||
        track.album?.cover_medium ||
        '',
      duration: track.duration || 0,
      downloadUrl: `/api/download/${track.id}`,
      previewUrl: track.preview || '',
    }));

    res.json(tracks);
  } catch (error) {
    console.error('Error searching Deezer:', error.message);
    res.status(500).json({ error: 'Error al buscar en Deezer' });
  }
});

// GET /api/download/:id - Audio Stream & Download Handler using Deezer ARL
app.get('/api/download/:id', async (req, res) => {
  const trackId = req.params.id;
  if (!trackId) {
    return res.status(400).json({ error: 'ID de canción requerido' });
  }

  try {
    // 1. Obtain track metadata from Deezer
    const trackRes = await axios.get(`https://api.deezer.com/track/${trackId}`, {
      headers: getDeezerHeaders(),
    });

    const trackData = trackRes.data;
    if (!trackData || trackData.error) {
      return res.status(404).json({ error: 'Canción no encontrada en Deezer' });
    }

    const title = trackData.title || `track_${trackId}`;
    const streamUrl = trackData.preview;

    if (!streamUrl) {
      return res.status(404).json({ error: 'URL de audio no disponible para esta pista' });
    }

    // 2. Fetch audio stream with ARL headers
    const audioRes = await axios.get(streamUrl, {
      responseType: 'stream',
      headers: getDeezerHeaders(),
    });

    const sanitizedTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, '');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizedTitle}.mp3"`
    );

    // Pipe audio stream to client
    audioRes.data.pipe(res);
  } catch (error) {
    console.error(`Error downloading track ${trackId}:`, error.message);
    res.status(500).json({ error: 'Error al procesar el audio de la canción' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Deezer Audio ejecutándose en el puerto ${PORT}`);
  console.log(`ARL Token: ${DEEZER_ARL ? 'Configurado' : 'No configurado (se usará vista previa)'}`);
});
