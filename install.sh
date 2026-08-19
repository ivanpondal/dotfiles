#!/bin/sh
set -eu

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

link() {
    src="$DOTFILES/$1"
    dest="$2"

    [ -e "$src" ] || { echo "skip:   $1 (missing in repo)"; return; }

    mkdir -p "$(dirname "$dest")"

    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
        echo "ok:     $dest"
        return
    fi

    if [ -e "$dest" ] || [ -L "$dest" ]; then
        backup="$dest.backup.$(date +%Y%m%d%H%M%S)"
        mv "$dest" "$backup"
        echo "backup: $dest -> $backup"
    fi

    ln -s "$src" "$dest"
    echo "link:   $dest"
}

link bin              "$HOME/bin"
link .vim             "$HOME/.vim"
link .vimrc           "$HOME/.vimrc"
link .bashrc          "$HOME/.bashrc"
link .gitconfig       "$HOME/.gitconfig"
link .gdbinit         "$HOME/.gdbinit"
link .xinitrc         "$HOME/.xinitrc"
link .Xresources      "$HOME/.Xresources"
link .drirc           "$HOME/.drirc"
link i3               "$HOME/.config/i3"
link i3status         "$HOME/.config/i3status"
link claude/skills    "$HOME/.claude/skills"
link claude/CLAUDE.md "$HOME/.claude/CLAUDE.md"
