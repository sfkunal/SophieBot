export async function handleHelp() {
  return {
    data: {
      help_text: [
        "Brain SMS cheatsheet:",
        "• Add: 'save Monteverde — Italian, West Loop, friend rec'",
        "• Watch: 'add Severance — sci-fi TV, moody'",
        "• List: 'what's on the restaurant list' / 'watchlist'",
        "• Suggest: 'where should we eat' / 'pick something to watch'",
        "• Done: 'finished Monteverde' / 'watched Severance'",
        "• Vote: '+1 Monteverde'",
        "• Calendar: 'are we free Friday?' / 'next time we're both free' / 'calendar tomorrow'",
      ].join("\n"),
    },
  };
}
