#!/bin/bash

# Download AI Models for PiyAPI Notes
# This script downloads all required AI models for the application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Model directory
MODELS_DIR="resources/models"

# Create models directory if it doesn't exist
mkdir -p "$MODELS_DIR"

echo "================================================"
echo "PiyAPI Notes - AI Models Download Script"
echo "================================================"
echo ""

# Function to download a file with progress
download_file() {
    local url=$1
    local output=$2
    local name=$3
    
    echo -e "${YELLOW}Downloading $name...${NC}"
    
    if command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$output" "$url"
    elif command -v wget &> /dev/null; then
        wget --show-progress -O "$output" "$url"
    else
        echo -e "${RED}Error: Neither curl nor wget is installed${NC}"
        exit 1
    fi
    
    if [ -f "$output" ]; then
        local size=$(du -h "$output" | cut -f1)
        echo -e "${GREEN}✓ Downloaded $name ($size)${NC}"
        echo ""
    else
        echo -e "${RED}✗ Failed to download $name${NC}"
        exit 1
    fi
}

# Function to verify file exists and show size
verify_file() {
    local file=$1
    local name=$2
    
    if [ -f "$file" ]; then
        local size=$(du -h "$file" | cut -f1)
        echo -e "${GREEN}✓ $name exists ($size)${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ $name not found${NC}"
        return 1
    fi
}

# Download Silero VAD Model
echo "1. Silero VAD Model"
echo "-------------------"
VAD_MODEL="$MODELS_DIR/silero_vad.onnx"
VAD_URL="https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx"

if verify_file "$VAD_MODEL" "Silero VAD"; then
    read -p "Model already exists. Re-download? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        download_file "$VAD_URL" "$VAD_MODEL" "Silero VAD"
    fi
else
    download_file "$VAD_URL" "$VAD_MODEL" "Silero VAD"
fi

# Download Whisper Turbo Model
echo "2. Whisper Turbo Model (High Tier - 16GB+ RAM)"
echo "-----------------------------------------------"
WHISPER_MODEL="$MODELS_DIR/ggml-large-v3-turbo.bin"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"

echo "Model: ggml-large-v3-turbo.bin (~1.6GB)"
echo "Performance: 51.8x real-time (30s audio → 0.58s processing)"
echo "RAM Usage: ~1.5GB during transcription"
echo "Use Case: High tier machines (16GB+ RAM)"
echo ""

if verify_file "$WHISPER_MODEL" "Whisper Turbo"; then
    read -p "Model already exists. Re-download? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        download_file "$WHISPER_URL" "$WHISPER_MODEL" "Whisper Turbo"
    fi
else
    download_file "$WHISPER_URL" "$WHISPER_MODEL" "Whisper Turbo"
fi

echo ""
echo "================================================"
echo "Download Summary"
echo "================================================"
echo ""

# Verify all models
verify_file "$VAD_MODEL" "Silero VAD (Voice Activity Detection)"
verify_file "$WHISPER_MODEL" "Whisper Turbo (ASR - High Tier)"

echo ""
echo -e "${GREEN}✓ All required models are ready!${NC}"
echo ""
echo "Models location: $MODELS_DIR"
echo ""
echo "Next steps:"
echo "1. The VAD model will be used by src/main/workers/vad.worker.ts"
echo "2. The Whisper Turbo model will be used for high-tier transcription (16GB+ RAM)"
echo "3. Run 'npm run dev' to start the application"
echo "4. The models will automatically load on first use"
echo ""
echo "Hardware Tier Information:"
echo "  - High (16GB+ RAM): Whisper Turbo (1.5GB RAM, 51.8x RT)"
echo "  - Mid/Low (8-12GB RAM): Moonshine Base (300MB RAM, 290x RT) - To be added"
echo ""
