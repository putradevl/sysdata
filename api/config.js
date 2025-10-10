// api/config.js
// Vercel Serverless Function untuk menyediakan Supabase config

export default function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Return config from environment variables
    res.status(200).json({
        supabaseUrl: process.env.VITE_SUPABASE_URL,
        supabaseKey: process.env.VITE_SUPABASE_KEY
    });
}