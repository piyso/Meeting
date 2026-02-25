#!/bin/bash

# Database Tests Runner
# Run all database unit tests

echo "Running Database Unit Tests..."
echo "================================"
echo ""

# Check if Node.js supports --test flag (Node 18+)
NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')

if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required for built-in test runner"
  echo "Current version: $(node -v)"
  echo ""
  echo "Alternative: Install a test framework like vitest or jest"
  exit 1
fi

# Run tests
echo "1. Testing Database Connection..."
node --test src/main/database/__tests__/connection.test.ts

echo ""
echo "2. Testing CRUD Operations..."
node --test src/main/database/__tests__/crud.test.ts

echo ""
echo "3. Testing FTS5 Search..."
node --test src/main/database/__tests__/search.test.ts

echo ""
echo "================================"
echo "All tests completed!"
