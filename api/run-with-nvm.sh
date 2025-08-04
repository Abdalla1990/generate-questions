#!/bin/bash
# run-with-nvm.sh - Script to run commands with proper nvm environment

# Load nvm if it exists
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
elif [ -s "/usr/local/nvm/nvm.sh" ]; then
    source "/usr/local/nvm/nvm.sh"
fi

# Use the Node version from .nvmrc if nvm is available
if command -v nvm > /dev/null 2>&1; then
    nvm use
fi

# Execute the command passed as arguments
exec "$@"
