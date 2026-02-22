#!/bin/bash

# A quick script to initialize and push your project to GitHub

echo "🎨 Preparing to upload CollabBoard to GitHub..."

# 1. Initialize git if not already initialized
if [ ! -d ".git" ]; then
  git init
  echo "✅ Initialized empty Git repository."
fi

# 2. Ask user for their GitHub repository URL
echo ""
echo "Please go to https://github.com/new and create a new, empty repository."
read -p "Paste your new GitHub repository URL here (e.g., https://github.com/username/collab-board.git): " repo_url

if [ -z "$repo_url" ]; then
    echo "❌ Error: Repository URL cannot be empty. Please run the script again."
    exit 1
fi

# 3. Add remote origin
git remote remove origin 2>/dev/null
git remote add origin "$repo_url"

# 4. Add all files (respecting .gitignore)
git add .
echo "✅ Added files to staging."

# 5. Commit
read -p "Enter a commit message (Press Enter to use default: 'Initial commit: Real-Time Collaborative Canvas'): " commit_message
commit_message=${commit_message:-"Initial commit: Real-Time Collaborative Canvas"}

git commit -m "$commit_message"
echo "✅ Committed changes."

# 6. Use 'main' branch
git branch -M main

# 7. Push to GitHub
echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "🎉 Done! Your project is now live on GitHub."
