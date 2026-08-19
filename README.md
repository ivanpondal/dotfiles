# dotfiles

## Install

```
./install.sh
```

Symlinks everything into place: `bin`, `.vim`, `.vimrc`, `.bashrc`,
`.gitconfig`, `.gdbinit`, `.xinitrc`, `.Xresources`, `.drirc`, `i3` and
`i3status` into `~/.config`, and the Claude Code config (`claude/skills`,
`claude/CLAUDE.md`) into `~/.claude`.

Safe to re-run: links already pointing at this repo are left alone, and
anything else in the way is moved to `<path>.backup.<timestamp>` rather than
overwritten. Works with both BSD (macOS) and GNU `ln`.

## Vim

Set up Vundle:

```
git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim
```
