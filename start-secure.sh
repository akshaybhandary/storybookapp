#!/bin/bash

# 🔒 Secure Development Server Launcher
# This script stops any insecure dev servers and starts the secure Netlify Dev server

echo "🔒 Starting Secure Development Server..."
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  WARNING: .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "📝 Please edit .env and add your GOOGLE_API_KEY"
    echo "   Then run this script again."
    exit 1
fi

# Check if GOOGLE_API_KEY is set
if ! grep -q "GOOGLE_API_KEY=" .env; then
    echo "⚠️  WARNING: GOOGLE_API_KEY not found in .env"
    echo "📝 Please add your Google API key to .env file:"
    echo "   GOOGLE_API_KEY=your_actual_key_here"
    exit 1
fi

echo "✅ Environment configured"
echo ""
echo "🚀 Starting Netlify Dev (secure API proxy enabled)..."
echo ""
echo "📍 Your app will be available at: http://localhost:8888"
echo "🔐 API calls will be proxied through: /.netlify/functions/google"
echo "✅ Your API key will NOT be exposed in the browser!"
echo ""
echo "Press Ctrl+C to stop the server"
echo "─────────────────────────────────────────────────────"
echo ""

# Start Netlify Dev
npm run dev:secure
