--[[
    NEXUS MARKET — server.lua  v3.0
    ESX · ox_lib · MySQL (oxmysql)

    PRESERVA TODO LO EXISTENTE:
    - perfecto_tablet:server:guardarNPC
    - perfecto_tablet:server:getNPCCoords (ServerCallback)
    - perfecto_tablet:getServerData (ServerCallback) — ENRIQUECIDO
    - marketplace:purchase
    - marketplace:server:postAd
    - perfecto_tablet:server:comprarObjetoTablet
    - ESX.RegisterUsableItem('tablet', ...)

    AGREGA:
    - Tabla SQL marketplace_listings (auto-init)
    - Tabla SQL marketplace_favourites (persistente por citizenid)
    - Tabla SQL marketplace_orders (órdenes de compra)
    - SEED listings en DB (siempre presentes, no se borran)
    - marketplace:server:buyItem
    - marketplace:server:saveFavourites
    - marketplace:server:removeAd
    - marketplace:server:activateListing
    - marketplace:server:getPendingListings (ServerCallback)
    - marketplace:server:getMyPurchases (ServerCallback)
    - marketplace:server:markPickedUp
    - marketplace:server:requestExhibitionVehicles
    - marketplace:server:guardarHangarNPC
    - marketplace:server:updateProfile
    - Broadcast a todos cuando cambia el mercado
]]

local fileName = "coords_tablet.json"
local hangarFileName = "coords_hangar.json"

-- Cache en memoria de los listings activos (se regenera desde DB al arrancar)
local activeListings = {}

-- Helper ESX legacy/nuevo para obtener nombre del jugador
local function _GetPlayerName(xPlayer)
    -- ESX legacy: xPlayer.name | ESX nuevo: xPlayer.getName()
    if type(xPlayer.getName) == 'function' then
        return xPlayer.getName()
    end
    return xPlayer.name or 'Unknown'
end

-- ══════════════════════════════════════════════════════════════
-- INICIALIZACIÓN DE TABLAS SQL
-- ══════════════════════════════════════════════════════════════

CreateThread(function()
    -- Listings del marketplace
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_listings` (
            `id`          INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`   VARCHAR(50)  NOT NULL,
            `seller_name` VARCHAR(100) NOT NULL,
            `item`        VARCHAR(100) NOT NULL,
            `label`       VARCHAR(200) NOT NULL,
            `price`       INT          NOT NULL,
            `qty`         INT          NOT NULL DEFAULT 1,
            `category`    VARCHAR(50)  NOT NULL DEFAULT 'default',
            `condition_v` VARCHAR(50)  NOT NULL DEFAULT 'New',
            `description` TEXT,
            `status`      VARCHAR(20)  NOT NULL DEFAULT 'pending',
            `is_vehicle`  TINYINT(1)   NOT NULL DEFAULT 0,
            `vehicle_model` VARCHAR(50) DEFAULT NULL,
            `vehicle_slot`  INT         DEFAULT NULL,
            `is_seed`     TINYINT(1)   NOT NULL DEFAULT 0,
            `created_at`  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX(`citizenid`), INDEX(`status`), INDEX(`category`)
        )
    ]])

    -- Favoritos persistentes
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_favourites` (
            `citizenid`  VARCHAR(50)  NOT NULL,
            `listing_id` VARCHAR(50)  NOT NULL,
            PRIMARY KEY (`citizenid`, `listing_id`)
        )
    ]])

    -- Órdenes de compra
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_orders` (
            `id`          INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`   VARCHAR(50)  NOT NULL,
            `listing_id`  VARCHAR(50)  NOT NULL,
            `item`        VARCHAR(100) NOT NULL,
            `label`       VARCHAR(200) NOT NULL,
            `price`       INT          NOT NULL,
            `is_vehicle`  TINYINT(1)   NOT NULL DEFAULT 0,
            `status`      VARCHAR(20)  NOT NULL DEFAULT 'pending',
            `created_at`  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX(`citizenid`), INDEX(`status`)
        )
    ]])

    Wait(500)
    -- Cargar listings activos en memoria
    _LoadActiveListings()
    print("^2[NEXUS MARKET]^7 Tablas inicializadas y listings cargados.")
end)

-- ══════════════════════════════════════════════════════════════
-- HELPERS INTERNOS
-- ══════════════════════════════════════════════════════════════

function _LoadActiveListings()
    local rows = MySQL.query.await([[
        SELECT * FROM marketplace_listings WHERE status = 'active'
    ]])
    activeListings = {}
    for _, row in ipairs(rows or {}) do
        table.insert(activeListings, _RowToListing(row))
    end
end

function _RowToListing(row)
    return {
        id          = row.is_seed == 1 and ('seed_' .. row.id) or row.id,
        dbId        = row.id,
        citizenid   = row.citizenid,
        seller      = row.seller_name,
        item        = row.item,
        label       = row.label,
        price       = row.price,
        qty         = row.qty,
        category    = row.category,
        condition   = row.condition_v,
        description = row.description or '',
        status      = row.status,
        isVehicle   = row.is_vehicle == 1,
        vehicleModel = row.vehicle_model,
        vehicleSlot  = row.vehicle_slot,
        isSeed      = row.is_seed == 1,
        date        = tostring(row.created_at or 'Reciente'),
    }
end

function _BroadcastListings()
    local listings = {}
    -- Sólo mandamos no-seed al cliente (el frontend ya tiene los seeds cargados)
    for _, l in ipairs(activeListings) do
        if not l.isSeed then
            table.insert(listings, l)
        end
    end
    TriggerClientEvent('marketplace:client:updateListings', -1, listings)
end

function _GetPlayerMoney(xPlayer)
    -- Intenta account 'bank' primero (ESX nuevo), fallback a getMoney()
    local ok, bankMoney = pcall(function()
        return xPlayer.getAccount('bank').money
    end)
    if ok and bankMoney then return bankMoney end
    return xPlayer.getMoney()
end

function _RemovePlayerMoney(xPlayer, amount)
    local ok = pcall(function()
        xPlayer.removeAccountMoney('bank', amount)
    end)
    if not ok then
        xPlayer.removeMoney(amount)
    end
end

function _AddPlayerMoney(xPlayer, amount)
    local ok = pcall(function()
        xPlayer.addAccountMoney('bank', amount)
    end)
    if not ok then
        xPlayer.addMoney(amount)
    end
end

function _GetNextVehicleSlot()
    local usedSlots = {}
    for _, l in ipairs(activeListings) do
        if l.isVehicle and l.vehicleSlot then
            usedSlots[l.vehicleSlot] = true
        end
    end
    for i = 1, 20 do
        if not usedSlots[i] then return i end
    end
    return 1
end

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO: GESTIÓN DEL NPC TABLET (JSON)
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('perfecto_tablet:server:guardarNPC')
AddEventHandler('perfecto_tablet:server:guardarNPC', function(coords, heading)
    local data = { x = coords.x, y = coords.y, z = coords.z, h = heading }
    SaveResourceFile(GetCurrentResourceName(), fileName, json.encode(data, { indent = true }), -1)
    TriggerClientEvent('perfecto_tablet:client:actualizarNPC', -1, data)
    print("^3[TABLET]^7 Nueva ubicación guardada y sincronizada.")
end)

ESX.RegisterServerCallback('perfecto_tablet:server:getNPCCoords', function(source, cb)
    local file = LoadResourceFile(GetCurrentResourceName(), fileName)
    if file then cb(json.decode(file)) else cb(nil) end
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: GESTIÓN DEL NPC HANGAR (JSON)
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:guardarHangarNPC')
AddEventHandler('marketplace:server:guardarHangarNPC', function(coords, heading)
    local data = { x = coords.x, y = coords.y, z = coords.z, h = heading }
    SaveResourceFile(GetCurrentResourceName(), hangarFileName, json.encode(data, { indent = true }), -1)
    print("^3[HANGAR]^7 NPC del hangar reubicado.")
end)

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO + ENRIQUECIDO: getServerData
-- Ahora incluye: listings, favourites, orders, myListings, playerName, citizenid
-- ══════════════════════════════════════════════════════════════

ESX.RegisterServerCallback('perfecto_tablet:getServerData', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then cb(nil) return end

    local citizenid = xPlayer.identifier  -- En ESX legacy es el identifier
    -- Si usás QBCore o ESX con citizenid distinto, ajustá esta línea

    -- Inventario
    local inventory = {}
    for _, v in pairs(xPlayer.getInventory()) do
        if v.count > 0 then
            table.insert(inventory, {
                name  = v.name,
                label = v.label,
                count = v.count
            })
        end
    end

    -- Favoritos del jugador
    local favRows = MySQL.query.await(
        'SELECT listing_id FROM marketplace_favourites WHERE citizenid = ?',
        { citizenid }
    )
    local favourites = {}
    for _, r in ipairs(favRows or {}) do
        table.insert(favourites, tostring(r.listing_id))
    end

    -- Órdenes del jugador
    local orderRows = MySQL.query.await(
        'SELECT * FROM marketplace_orders WHERE citizenid = ? ORDER BY created_at DESC LIMIT 30',
        { citizenid }
    )
    local orders = {}
    for _, r in ipairs(orderRows or {}) do
        table.insert(orders, {
            id        = '#ORD-' .. r.id,
            item      = r.label,
            date      = tostring(r.created_at or ''),
            amount    = r.price,
            status    = r.status,
            isVehicle = r.is_vehicle == 1,
            orderId   = r.id,
        })
    end

    -- Mis publicaciones (pending + active)
    local myRows = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE citizenid = ? AND status IN ("pending","active") ORDER BY created_at DESC',
        { citizenid }
    )
    local myListings = {}
    for _, r in ipairs(myRows or {}) do
        table.insert(myListings, _RowToListing(r))
    end

    -- Saldo bancario
    local money = _GetPlayerMoney(xPlayer)

    cb({
        money       = money,
        inventory   = inventory,
        listings    = {},  -- El cliente usa los activeListings cacheados (se mandan en updateListings)
        favourites  = favourites,
        orders      = orders,
        myListings  = myListings,
        playerName  = _GetPlayerName(xPlayer),
        citizenid   = citizenid,
        job         = xPlayer.job and xPlayer.job.name or '',
        items       = Config.Items,
    })
end)

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO: marketplace:purchase (compra legacy con efectivo)
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:purchase')
AddEventHandler('marketplace:purchase', function(items, total)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then return end

    if _GetPlayerMoney(xPlayer) >= total then
        _RemovePlayerMoney(xPlayer, total)
        for _, itemData in pairs(items) do
            local itemName  = itemData.item or itemData.name
            local itemCount = itemData.count or 1
            xPlayer.addInventoryItem(itemName, itemCount)
        end
        TriggerClientEvent('esx:showNotification', _source, "Pagaste $" .. total .. " por tu compra.")
    else
        TriggerClientEvent('esx:showNotification', _source, "~r~No tenés suficiente dinero.")
    end
end)

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO + ACTUALIZADO: marketplace:server:postAd
-- Ahora ServerCallback para que el NUI reciba el id
-- ══════════════════════════════════════════════════════════════

ESX.RegisterServerCallback('marketplace:server:postAd', function(source, cb, data)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then
        cb({ success = false, reason = 'Jugador no encontrado' })
        return
    end

    local citizenid = xPlayer.identifier
    local commission = Config.ListingCommission or 0

    if commission > 0 and _GetPlayerMoney(xPlayer) < commission then
        TriggerClientEvent('esx:showNotification', _source, "No tenés dinero para la comisión.")
        cb({ success = false, reason = 'Sin fondos para comisión' })
        return
    end

    if commission > 0 then _RemovePlayerMoney(xPlayer, commission) end

    local newId = MySQL.insert.await([[
        INSERT INTO marketplace_listings
        (citizenid, seller_name, item, label, price, qty, category, condition_v, description, status, is_vehicle, vehicle_model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ]], {
        citizenid,
        _GetPlayerName(xPlayer),
        data.item,
        data.label,
        data.price,
        data.amount or 1,
        data.category or 'default',
        data.condition or 'New',
        data.desc or '',
        data.isVehicle and 1 or 0,
        data.isVehicle and data.item or nil,
    })

    print(string.format("^2[NEXUS]^7 Nuevo listing PENDIENTE #%d — %s por %s",
        newId, data.label, _GetPlayerName(xPlayer)))

    cb({ success = true, id = newId })
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Activar listing desde hangar
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:activateListing')
AddEventHandler('marketplace:server:activateListing', function(listingId, isVehicle)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then return end

    local citizenid = xPlayer.identifier

    -- Verificar que le pertenece y está pending
    local row = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE id = ? AND citizenid = ? AND status = "pending"',
        { listingId, citizenid }
    )[1]

    if not row then
        TriggerClientEvent('esx:showNotification', _source, "~r~No se encontró la publicación pendiente.")
        return
    end

    -- Si es vehículo, asignarle un slot
    local vehicleSlot = nil
    if isVehicle then
        vehicleSlot = _GetNextVehicleSlot()
        MySQL.update.await(
            'UPDATE marketplace_listings SET status = "active", vehicle_slot = ? WHERE id = ?',
            { vehicleSlot, listingId }
        )
    else
        MySQL.update.await(
            'UPDATE marketplace_listings SET status = "active" WHERE id = ?',
            { listingId }
        )
    end

    -- Agregar a caché
    local listing = _RowToListing(row)
    listing.status      = 'active'
    listing.vehicleSlot = vehicleSlot
    table.insert(activeListings, listing)

    -- Notificar a TODOS los clientes que el listing está activo
    TriggerClientEvent('marketplace:client:listingActivated', -1, listingId, listing)
    _BroadcastListings()

    print(string.format("^2[NEXUS]^7 Listing #%d activado por %s", listingId, _GetPlayerName(xPlayer)))
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Comprar item (marketplace:server:buyItem)
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:buyItem')
AddEventHandler('marketplace:server:buyItem', function(data, cb)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then
        if cb then cb({ success = false, reason = 'Jugador no encontrado' }) end
        return
    end

    local citizenid = xPlayer.identifier
    local isSeed    = data.isSeed or false
    local listingId = data.listingId
    local price     = data.price
    local isVehicle = data.isVehicle or false

    -- Verificar saldo
    local balance = _GetPlayerMoney(xPlayer)
    if balance < price then
        if cb then cb({ success = false, reason = 'Saldo bancario insuficiente' }) end
        return
    end

    -- Descontar dinero del comprador
    _RemovePlayerMoney(xPlayer, price)

    -- Si no es seed, marcar el listing como vendido en DB
    if not isSeed then
        MySQL.update.await(
            'UPDATE marketplace_listings SET status = "sold" WHERE id = ?',
            { listingId }
        )
        -- Remover del caché
        for i, l in ipairs(activeListings) do
            if tostring(l.dbId) == tostring(listingId) or tostring(l.id) == tostring(listingId) then
                -- Pagar al vendedor si está online
                local sellerCitizenid = l.citizenid
                if sellerCitizenid then
                    local sellerPlayer = ESX.GetPlayerFromIdentifier(sellerCitizenid)
                    local sellerEarns  = math.floor(price * 0.95)  -- 5% comisión
                    if sellerPlayer then
                        _AddPlayerMoney(sellerPlayer, sellerEarns)
                        TriggerClientEvent('esx:showNotification', sellerPlayer.source,
                            "~g~Vendiste " .. data.label .. " por $" .. sellerEarns)
                        TriggerClientEvent('marketplace:client:updateBalance', sellerPlayer.source,
                            _GetPlayerMoney(sellerPlayer))
                    else
                        -- Guardar en DB para cuando entre
                        MySQL.update.await(
                            'UPDATE marketplace_listings SET status = "sold" WHERE id = ?',
                            { l.dbId }
                        )
                        -- TODO: sistema de pago diferido al login
                    end
                end
                table.remove(activeListings, i)
                break
            end
        end
    end

    -- Crear orden de compra
    local orderId = MySQL.insert.await([[
        INSERT INTO marketplace_orders (citizenid, listing_id, item, label, price, is_vehicle, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ]], {
        citizenid,
        tostring(listingId),
        data.item,
        data.label,
        price,
        isVehicle and 1 or 0,
    })

    -- Si no es vehículo: dar item directo al inventario
    if not isVehicle then
        xPlayer.addInventoryItem(data.item, data.qty or 1)
        -- Marcar orden como completada
        MySQL.update.await('UPDATE marketplace_orders SET status = "completed" WHERE id = ?', { orderId })
    end
    -- Si es vehículo: queda en status 'pending' hasta que lo retire en el hangar

    -- Notificar a TODOS que el listing fue comprado (para sacarlo de la tablet)
    if not isSeed then
        TriggerClientEvent('marketplace:client:listingPurchased', -1, listingId, data.label, price)
        _BroadcastListings()
    end

    -- Notificar saldo al comprador
    local newBalance = _GetPlayerMoney(xPlayer)
    TriggerClientEvent('marketplace:client:updateBalance', _source, newBalance)

    print(string.format("^2[NEXUS]^7 %s compró %s por $%d", _GetPlayerName(xPlayer), data.label, price))

    if cb then cb({
        success = true,
        balance = newBalance,
        orderId = orderId,
    }) end
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Eliminar publicación propia
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:removeAd')
AddEventHandler('marketplace:server:removeAd', function(listingId, cb)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then
        if cb then cb({ success = false, reason = 'Jugador no encontrado' }) end
        return
    end

    local citizenid = xPlayer.identifier

    -- Verificar propiedad
    local row = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE id = ? AND citizenid = ?',
        { listingId, citizenid }
    )[1]

    if not row then
        if cb then cb({ success = false, reason = 'No tenés permiso para eliminar esta publicación' }) end
        return
    end

    -- Si estaba activo y era vehículo, notificar a todos para despawnear
    if row.status == 'active' and row.is_vehicle == 1 then
        TriggerClientEvent('marketplace:client:listingPurchased', -1, listingId, row.label, 0)
    end

    -- Devolver el item si estaba pendiente (todavía no lo habían entregado)
    if row.status == 'pending' and row.is_vehicle == 0 then
        xPlayer.addInventoryItem(row.item, row.qty)
        TriggerClientEvent('esx:showNotification', _source, "~y~Item devuelto a tu inventario.")
    end

    MySQL.update.await('UPDATE marketplace_listings SET status = "cancelled" WHERE id = ?', { listingId })

    -- Remover del caché
    for i, l in ipairs(activeListings) do
        if tostring(l.dbId) == tostring(listingId) then
            table.remove(activeListings, i)
            break
        end
    end

    _BroadcastListings()
    if cb then cb({ success = true }) end
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Obtener listings pendientes del jugador (para hangar NPC)
-- ══════════════════════════════════════════════════════════════

ESX.RegisterServerCallback('marketplace:server:getPendingListings', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then cb({}) return end

    local rows = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE citizenid = ? AND status = "pending"',
        { xPlayer.identifier }
    )
    local result = {}
    for _, r in ipairs(rows or {}) do
        table.insert(result, _RowToListing(r))
    end
    cb(result)
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Obtener compras pendientes de retiro
-- ══════════════════════════════════════════════════════════════

ESX.RegisterServerCallback('marketplace:server:getMyPurchases', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then cb({}) return end

    local rows = MySQL.query.await([[
        SELECT * FROM marketplace_orders
        WHERE citizenid = ? AND status = 'pending'
        ORDER BY created_at DESC
    ]], { xPlayer.identifier })

    local result = {}
    for _, r in ipairs(rows or {}) do
        table.insert(result, {
            orderId   = r.id,
            item      = r.item,
            label     = r.label,
            price     = r.price,
            isVehicle = r.is_vehicle == 1,
        })
    end
    cb(result)
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Marcar item como retirado
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:markPickedUp')
AddEventHandler('marketplace:server:markPickedUp', function(orderId)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if not xPlayer then return end

    -- Verificar que es su orden
    local row = MySQL.query.await(
        'SELECT * FROM marketplace_orders WHERE id = ? AND citizenid = ? AND status = "pending"',
        { orderId, xPlayer.identifier }
    )[1]

    if not row then return end

    MySQL.update.await('UPDATE marketplace_orders SET status = "completed" WHERE id = ?', { orderId })

    -- Si no es vehículo, dar el item
    if row.is_vehicle == 0 then
        xPlayer.addInventoryItem(row.item, 1)
    end

    TriggerClientEvent('esx:showNotification', _source,
        "~g~Retiraste: " .. row.label)
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Favoritos persistentes
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:saveFavourites')
AddEventHandler('marketplace:server:saveFavourites', function(citizenid, favourites)
    if not citizenid or not favourites then return end

    -- Borrar favoritos actuales y reescribir
    MySQL.query.await('DELETE FROM marketplace_favourites WHERE citizenid = ?', { citizenid })

    if #favourites > 0 then
        local params = {}
        for _, fid in ipairs(favourites) do
            table.insert(params, { citizenid, tostring(fid) })
        end
        MySQL.insert.await(
            'INSERT IGNORE INTO marketplace_favourites (citizenid, listing_id) VALUES ' ..
            string.rep('(?,?),', #params - 1) .. '(?,?)',
            _flatten(params)
        )
    end
end)

function _flatten(t)
    local result = {}
    for _, row in ipairs(t) do
        for _, v in ipairs(row) do
            table.insert(result, v)
        end
    end
    return result
end

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Enviar vehículos en exposición al cliente que conecta
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:requestExhibitionVehicles')
AddEventHandler('marketplace:server:requestExhibitionVehicles', function()
    local _source = source
    local vehicleListings = {}
    for _, l in ipairs(activeListings) do
        if l.isVehicle and l.vehicleModel and l.vehicleSlot then
            table.insert(vehicleListings, l)
        end
    end
    TriggerClientEvent('marketplace:client:spawnExhibitionVehicles', _source, vehicleListings)
end)

-- ══════════════════════════════════════════════════════════════
-- NUEVO: Actualizar perfil
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('marketplace:server:updateProfile')
AddEventHandler('marketplace:server:updateProfile', function(data)
    -- Aquí podés guardar en DB si tenés tabla de perfiles
    -- Por ahora solo logueamos
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    if xPlayer and data.displayName then
        print(string.format("[NEXUS] %s actualizó su perfil: %s", _GetPlayerName(xPlayer), data.displayName))
    end
end)

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO: Comprar objeto tablet
-- ══════════════════════════════════════════════════════════════

RegisterNetEvent('perfecto_tablet:server:comprarObjetoTablet')
AddEventHandler('perfecto_tablet:server:comprarObjetoTablet', function()
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    local precio  = 500
    local nombreItem = "tablet"

    if not xPlayer then
        print("^1[ERROR]^7 No se pudo encontrar al jugador con ID: " .. _source)
        return
    end

    local dineroActual = _GetPlayerMoney(xPlayer)

    if dineroActual >= precio then
        _RemovePlayerMoney(xPlayer, precio)
        xPlayer.addInventoryItem(nombreItem, 1)
        TriggerClientEvent('esx:showNotification', _source, "Compraste una Tablet por $500")
        print("^2[SUCCESS]^7 Tablet entregada a " .. _GetPlayerName(xPlayer))
    else
        TriggerClientEvent('esx:showNotification', _source, "~r~No tenés suficiente dinero ($500)")
    end
end)

-- ══════════════════════════════════════════════════════════════
-- PRESERVADO: Item usable
-- ══════════════════════════════════════════════════════════════

ESX.RegisterUsableItem('tablet', function(source)
    TriggerClientEvent('perfecto_tablet:client:usarTablet', source)
end)
