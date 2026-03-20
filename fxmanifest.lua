fx_version 'cerulean'
game 'gta5'

author 'Lautaro'
description 'Nexus Market — Tablet Marketplace v3.0'
version '3.0.0'

-- ── SHARED (cargado en cliente Y servidor) ────────────────────
shared_scripts {
    '@es_extended/imports.lua',
    '@ox_lib/init.lua',
    'config.lua'           -- SIEMPRE antes que client/server
}

-- ── NUI ───────────────────────────────────────────────────────
ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
}



-- ── CLIENTE ───────────────────────────────────────────────────
client_scripts {
    'client/client.lua'
}

-- ── SERVIDOR ──────────────────────────────────────────────────
server_scripts {
    '@oxmysql/lib/MySQL.lua',    -- Driver MySQL async (oxmysql)
    'server/server.lua'
}

-- ── DEPENDENCIAS ──────────────────────────────────────────────
dependencies {
    'es_extended',
    'ox_lib',
    'ox_target',
    'oxmysql',
}
