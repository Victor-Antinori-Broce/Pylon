#!/bin/sh
# Husky hook script

# Source any local config
if [ -f ~/.huskyrc ]; then
  . ~/.huskyrc
fi

# Run the hook
. "$0"
