const themes={
  noir:{"--pa-bg":"#181819","--pa-fg":"#f3eee7","--pa-muted":"#b9b3ad","--pa-line":"#f3eee730"},
  ivory:{"--pa-bg":"#f4efe7","--pa-fg":"#242022","--pa-muted":"#665d59","--pa-line":"#24202230"},
  warm:{"--pa-bg":"#e5d5c3","--pa-fg":"#37271f","--pa-muted":"#665246","--pa-line":"#37271f30"},
} as const;
export function themeTokens(theme:string) {return themes[theme==="ivory"?"ivory":theme==="warm"?"warm":"noir"];}
