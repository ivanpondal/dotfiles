
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
PS1='\u@\h \W$(__git_ps1)\$ '

source /usr/share/git/completion/git-prompt.sh
