syntax enable

colorscheme monokai

"allow hidden buffers
set hidden

set number
set showmatch

set autoindent
set smartindent
set smarttab

"tabstop equals how many spaces a tab represents
"softtabstop and shiftwidth replace tabs for spaces when expandtab is used
set tabstop=4
set softtabstop=4
set shiftwidth=4
set noexpandtab

"word wrap
set textwidth=80

"faster rendering settings
set ttyfast
set lazyredraw

"search while typing and highlight results
set incsearch
set hlsearch

"prettier whitespace characters
set listchars=eol:¬,tab:➝\ ,trail:~,extends:>,precedes:<,space:·

"match angle brackets
set mps+=<:>

"vundle config
set nocompatible
filetype off

set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()

Plugin 'gmarik/Vundle.vim'

Plugin 'kien/ctrlp.vim'
let g:ctrlp_working_path_mode = 0

call vundle#end()
filetype plugin indent on
