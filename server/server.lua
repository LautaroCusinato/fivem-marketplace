--[[
    NEXUS MARKET — server.lua  v7.0  CLEAN REWRITE
    ESX · oxmysql

    REGLA DE ORO:
    - getServerData: max 3 queries .await (como el v4 que funcionaba)
    - ServerCallbacks con queries: siempre Citizen.CreateThread
    - markPickedUp: ESX.RegisterServerCallback (no NetEvent)
      → el source/xPlayer no se pierde en callbacks async
    - Vehículos al retirar: INSERT player_vehicles directo (sin spawn)
]]

local fileName       = "coords_tablet.json"
local hangarFileName = "coords_hangar.json"
local activeListings = {}

-- ══════════════════════════════════════════════════════════════
-- INIT TABLAS
-- ══════════════════════════════════════════════════════════════
CreateThread(function()
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_listings` (
            `id`            INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`     VARCHAR(50)  NOT NULL,
            `seller_name`   VARCHAR(100) NOT NULL,
            `item`          VARCHAR(100) NOT NULL,
            `label`         VARCHAR(200) NOT NULL,
            `price`         INT          NOT NULL DEFAULT 0,
            `qty`           INT          NOT NULL DEFAULT 1,
            `min_qty`       INT          NOT NULL DEFAULT 1,
            `category`      VARCHAR(50)  NOT NULL DEFAULT 'consumables',
            `description`   TEXT,
            `status`        VARCHAR(20)  NOT NULL DEFAULT 'pending',
            `is_vehicle`    TINYINT(1)   NOT NULL DEFAULT 0,
            `vehicle_model` VARCHAR(50)  DEFAULT NULL,
            `vehicle_slot`  INT          DEFAULT NULL,
            `is_seed`       TINYINT(1)   NOT NULL DEFAULT 0,
            `created_at`    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX(`citizenid`), INDEX(`status`), INDEX(`category`)
        )
    ]])
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_favourites` (
            `citizenid`  VARCHAR(50) NOT NULL,
            `listing_id` VARCHAR(50) NOT NULL,
            PRIMARY KEY (`citizenid`, `listing_id`)
        )
    ]])
    MySQL.query([[
        CREATE TABLE IF NOT EXISTS `marketplace_orders` (
            `id`          INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`   VARCHAR(50)  NOT NULL,
            `listing_id`  VARCHAR(50)  NOT NULL DEFAULT '0',
            `item`        VARCHAR(100) NOT NULL,
            `label`       VARCHAR(200) NOT NULL,
            `price`       INT          NOT NULL DEFAULT 0,
            `qty`         INT          NOT NULL DEFAULT 1,
            `is_vehicle`  TINYINT(1)   NOT NULL DEFAULT 0,
            `order_type`  VARCHAR(20)  NOT NULL DEFAULT 'purchase',
            `status`      VARCHAR(20)  NOT NULL DEFAULT 'pending',
            `created_at`  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            INDEX(`citizenid`), INDEX(`status`), INDEX(`order_type`)
        )
    ]])
    MySQL.query("ALTER TABLE `marketplace_listings` ADD COLUMN IF NOT EXISTS `min_qty`      INT          NOT NULL DEFAULT 1")
    MySQL.query("ALTER TABLE `marketplace_orders`   ADD COLUMN IF NOT EXISTS `qty`         INT          NOT NULL DEFAULT 1")
    MySQL.query("ALTER TABLE `marketplace_orders`   ADD COLUMN IF NOT EXISTS `order_type`  VARCHAR(20)  NOT NULL DEFAULT 'purchase'")
    Wait(500)
    _LoadActiveListings()
    print("^2[NEXUS MARKET]^7 v7.0 iniciado — OK")
end)

-- ══════════════════════════════════════════════════════════════
-- HELPERS
-- ══════════════════════════════════════════════════════════════
function _LoadActiveListings()
    local rows = MySQL.query.await('SELECT * FROM marketplace_listings WHERE status = "active"')
    activeListings = {}
    for _, r in ipairs(rows or {}) do table.insert(activeListings, _RowToListing(r)) end
end

function _RowToListing(row)
    return {
        id           = row.is_seed == 1 and ('seed_' .. row.id) or row.id,
        dbId         = row.id,
        citizenid    = row.citizenid,
        seller       = row.seller_name,
        item         = row.item,
        label        = row.label,
        price        = row.price,
        qty          = row.qty,
        min_qty      = row.min_qty or 1,
        category     = row.category or _InferCategory(row.item),
        description  = row.description or '',
        status       = row.status,
        isVehicle    = row.is_vehicle == 1,
        vehicleModel = row.vehicle_model,
        vehicleSlot  = row.vehicle_slot,
        isSeed       = row.is_seed == 1,
        date         = tostring(row.created_at or 'Reciente'),
    }
end

function _InferCategory(name)
    if not name then return 'consumables' end
    local n = string.lower(name)
    if string.find(n, 'weapon_') or n == 'armor' then return 'weapons' end
    local veh = { adder=1,zentorno=1,elegy2=1,elegy=1,comet2=1,comet=1,
                  sultan=1,kuruma=1,t20=1,banshee=1,infernus=1,cheetah=1,vacca=1,entity=1 }
    if veh[n] then return 'vehicles' end
    if string.find(n,'_key') or string.find(n,'vehicle_') then return 'vehicles' end
    local tools = { repairkit=1,lockpick=1,screwdriver=1,drill=1,thermite=1,
                    turbo=1,advancedrepairkit=1,advancedlockpick=1 }
    if tools[n] then return 'tools' end
    return 'consumables'
end

function _BroadcastListings()
    local list = {}
    for _, l in ipairs(activeListings) do if not l.isSeed then table.insert(list, l) end end
    TriggerClientEvent('marketplace:client:updateListings', -1, list)
end

function _GetMoney(xp)
    local ok, v = pcall(function() return xp.getAccount('bank').money end)
    if ok and v then return v end
    return xp.getMoney()
end
function _RemoveMoney(xp, n)
    if not pcall(function() xp.removeAccountMoney('bank', n) end) then xp.removeMoney(n) end
end
function _AddMoney(xp, n)
    if not pcall(function() xp.addAccountMoney('bank', n) end) then xp.addMoney(n) end
end

function _GiveItem(xp, item, qty)
    print(string.format("^3[NEXUS]^7 _GiveItem: intentando dar %s x%d a %s (source=%s)",
        tostring(item), tonumber(qty) or 0, xp.getName(), tostring(xp.source)))

    -- Método 1: ESX addInventoryItem (directo, sin ox_inventory)
    -- Este es el método que funciona en ESX legacy puro
    local ok, err = pcall(function()
        xp.addInventoryItem(item, qty)
    end)
    if ok then
        print(string.format("^2[NEXUS]^7 _GiveItem OK (ESX): %s x%d a %s", item, qty, xp.getName()))
        return true
    end
    print("^1[NEXUS]^7 _GiveItem ESX falló: " .. tostring(err))

    -- Método 2: TriggerEvent directo al inventario de ESX
    local ok2, err2 = pcall(function()
        TriggerEvent('esx:addInventoryItem', xp.source, item, qty)
    end)
    if ok2 then
        print(string.format("^2[NEXUS]^7 _GiveItem OK (TriggerEvent): %s x%d a %s", item, qty, xp.getName()))
        return true
    end
    print("^1[NEXUS]^7 _GiveItem TriggerEvent falló: " .. tostring(err2))

    print(string.format("^1[NEXUS]^7 _GiveItem FALLÓ COMPLETAMENTE: item='%s' qty=%d jugador=%s",
        tostring(item), tonumber(qty) or 0, xp.getName()))
    return false
end

function _TakeItem(xp, item, qty)
    local ok, err = pcall(function() xp.removeInventoryItem(item, qty) end)
    if not ok then
        print("^1[NEXUS]^7 TakeItem FAILED: " .. item .. " — " .. tostring(err))
        return false
    end
    return true
end

function _GetNextVehicleSlot()
    local used = {}
    for _, l in ipairs(activeListings) do
        if l.isVehicle and l.vehicleSlot then used[l.vehicleSlot] = true end
    end
    for i = 1, 20 do if not used[i] then return i end end
    return 1
end

function _InsertVehicleGarage(citizenid, vehicleModel)
    -- Verificar si ya existe
    local rows = MySQL.query.await(
        'SELECT id FROM player_vehicles WHERE owner = ? AND vehicle = ? LIMIT 1',
        { citizenid, vehicleModel })
    if rows and #rows > 0 then
        print("[NEXUS] " .. citizenid .. " ya tiene " .. vehicleModel .. " en garage")
        return true, 'ya_tiene'
    end
    local plate = 'NX' .. math.random(10000, 99999)
    local ok, err = pcall(function()
        MySQL.insert.await(
            'INSERT INTO player_vehicles (owner, vehicle, plate, garage, fuel, engine, body, stored) VALUES (?,?,?,?,100,1000,1000,1)',
            { citizenid, vehicleModel, plate, 'pillboxhill' })
    end)
    if ok then
        print(string.format("^2[NEXUS]^7 Vehiculo %s -> garage %s (plate %s)", vehicleModel, citizenid, plate))
        return true, 'insertado'
    else
        print("^1[NEXUS]^7 Error garage INSERT: " .. tostring(err))
        return false, tostring(err)
    end
end

-- ══════════════════════════════════════════════════════════════
-- NPC COORDS
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('perfecto_tablet:server:guardarNPC')
AddEventHandler('perfecto_tablet:server:guardarNPC', function(coords, heading)
    local d = { x=coords.x, y=coords.y, z=coords.z, h=heading }
    SaveResourceFile(GetCurrentResourceName(), fileName, json.encode(d,{indent=true}), -1)
    TriggerClientEvent('perfecto_tablet:client:actualizarNPC', -1, d)
    print("^3[TABLET]^7 NPC guardado")
end)
ESX.RegisterServerCallback('perfecto_tablet:server:getNPCCoords', function(source, cb)
    local f = LoadResourceFile(GetCurrentResourceName(), fileName)
    cb(f and json.decode(f) or nil)
end)
RegisterNetEvent('marketplace:server:guardarHangarNPC')
AddEventHandler('marketplace:server:guardarHangarNPC', function(coords, heading)
    local d = { x=coords.x, y=coords.y, z=coords.z, h=heading }
    SaveResourceFile(GetCurrentResourceName(), hangarFileName, json.encode(d,{indent=true}), -1)
    print("^3[HANGAR]^7 NPC guardado")
end)

-- ══════════════════════════════════════════════════════════════
-- getServerData — EXACTO al v4 que funcionaba
-- Máximo 3 queries .await, sin _GetProfileStats
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('perfecto_tablet:getServerData', function(source, cb)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb(nil); return end
    local cid = xp.identifier

    -- Inventario (sin DB)
    local inventory = {}
    for _, v in pairs(xp.getInventory()) do
        if v.count > 0 then
            table.insert(inventory, { name=v.name, label=v.label, count=v.count })
        end
    end

    -- Favoritos
    local favs = {}
    for _, r in ipairs(MySQL.query.await('SELECT listing_id FROM marketplace_favourites WHERE citizenid=?',{cid}) or {}) do
        table.insert(favs, tostring(r.listing_id))
    end

    -- Órdenes (últimas 20)
    local orders = {}
    for _, r in ipairs(MySQL.query.await('SELECT * FROM marketplace_orders WHERE citizenid=? ORDER BY created_at DESC LIMIT 20',{cid}) or {}) do
        local qty = r.qty or 1
        table.insert(orders, {
            id        = '#ORD-' .. r.id,
            orderId   = r.id,
            item      = qty > 1 and (r.label..' x'..qty) or r.label,
            date      = tostring(r.created_at or ''),
            amount    = r.price * qty,
            status    = r.status,
            isVehicle = r.is_vehicle == 1,
        })
    end

    -- Mis publicaciones
    local myListings = {}
    for _, r in ipairs(MySQL.query.await('SELECT * FROM marketplace_listings WHERE citizenid=? AND status IN ("pending","active") ORDER BY created_at DESC',{cid}) or {}) do
        table.insert(myListings, _RowToListing(r))
    end

    -- Listings activos (de DB, no seeds)
    local listings = {}
    for _, l in ipairs(activeListings) do if not l.isSeed then table.insert(listings, l) end end

    cb({
        money      = _GetMoney(xp),
        inventory  = inventory,
        listings   = listings,
        favourites = favs,
        orders     = orders,
        myListings = myListings,
        profile    = { totalSpent=0, totalEarned=0, totalSales=0, totalPurchases=0 },
        playerName = xp.getName(),
        citizenid  = cid,
        job        = xp.job and xp.job.name or '',
        items      = Config.Items,
    })
end)

-- ══════════════════════════════════════════════════════════════
-- marketplace:purchase — legacy
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('marketplace:purchase')
AddEventHandler('marketplace:purchase', function(items, total)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then return end
    if _GetMoney(xp) >= total then
        _RemoveMoney(xp, total)
        for _, d in pairs(items) do xp.addInventoryItem(d.item or d.name, d.count or 1) end
        TriggerClientEvent('esx:showNotification', source, "Pagaste $"..total)
    else
        TriggerClientEvent('esx:showNotification', source, "~r~Sin fondos")
    end
end)

-- ══════════════════════════════════════════════════════════════
-- postAdCB
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:postAdCB', function(source, cb, data)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({success=false,reason='Sin jugador'}); return end
        local commission = Config.ListingCommission or 0
        if commission > 0 and _GetMoney(xp) < commission then
            cb({success=false,reason='Sin fondos para comision'}); return
        end
        if commission > 0 then _RemoveMoney(xp, commission) end
        local qty    = data.amount or 1
        local minQty = math.max(1, math.min(data.minQty or 1, qty))
        local newId  = MySQL.insert.await([[
            INSERT INTO marketplace_listings
            (citizenid,seller_name,item,label,price,qty,min_qty,category,description,status,is_vehicle,vehicle_model)
            VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)
        ]], { xp.identifier, xp.getName(), data.item, data.label or data.item,
              data.price, qty, minQty, _InferCategory(data.item), data.desc or '',
              data.isVehicle and 1 or 0, data.isVehicle and data.item or nil })
        print(string.format("^2[NEXUS]^7 PENDING #%d %s x%d por %s", newId, data.item, qty, xp.getName()))
        cb({success=true, id=newId})
end)

-- ══════════════════════════════════════════════════════════════
-- buyItemCB
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:buyItemCB', function(source, cb, data)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({success=false,reason='Sin jugador'}); return end
        local cid       = xp.identifier
        local qty       = math.max(1, data.qty or 1)
        local unitPrice = data.price
        local total     = data.totalPrice or (unitPrice * qty)
        local isSeed    = data.isSeed    or false
        local isVehicle = data.isVehicle or false
        local listingId = data.listingId

        -- Validar stock DB (no seeds)
        if not isSeed then
            local rows = MySQL.query.await(
                'SELECT qty, min_qty FROM marketplace_listings WHERE id=? AND status="active"',
                { listingId })
            local row = rows and rows[1] or nil
            if not row then cb({success=false,reason='Listing no disponible'}); return end
            if qty < (row.min_qty or 1) then cb({success=false,reason='Cantidad menor al minimo'}); return end
            if qty > row.qty then cb({success=false,reason='Stock insuficiente'}); return end
        end

        if _GetMoney(xp) < total then cb({success=false,reason='Saldo insuficiente'}); return end
        _RemoveMoney(xp, total)

        -- Actualizar listing
        if not isSeed then
            MySQL.update.await('UPDATE marketplace_listings SET qty=qty-? WHERE id=?',{qty,listingId})
            local upd = MySQL.query.await('SELECT qty FROM marketplace_listings WHERE id=?',{listingId})
            local rem = (upd and upd[1]) and upd[1].qty or 0
            if rem <= 0 then
                MySQL.update.await('UPDATE marketplace_listings SET status="sold" WHERE id=?',{listingId})
            end
            local earn = math.floor(total * 0.95)
            for i, l in ipairs(activeListings) do
                if tostring(l.dbId) == tostring(listingId) then
                    if rem <= 0 then table.remove(activeListings,i) else activeListings[i].qty=rem end
                    local sp = ESX.GetPlayerFromIdentifier(l.citizenid)
                    if sp then
                        _AddMoney(sp, earn)
                        TriggerClientEvent('esx:showNotification', sp.source,
                            "~g~Vendiste "..data.label..(qty>1 and ' x'..qty or '').." +$"..earn)
                        TriggerClientEvent('marketplace:client:updateBalance', sp.source, _GetMoney(sp))
                    end
                    break
                end
            end
            if rem <= 0 then
                TriggerClientEvent('marketplace:client:listingPurchased',-1,listingId,data.label,total)
            end
            _BroadcastListings()
        end

        -- Crear orden (siempre pending, se retira en hangar)
        local orderId = MySQL.insert.await(
            'INSERT INTO marketplace_orders (citizenid,listing_id,item,label,price,qty,is_vehicle,order_type,status) VALUES (?,?,?,?,?,?,?,?,?)',
            { cid, tostring(listingId), data.item, data.label, unitPrice, qty, isVehicle and 1 or 0, 'purchase', 'pending' })

        local newBal = _GetMoney(xp)
        TriggerClientEvent('marketplace:client:updateBalance', source, newBal)
        TriggerClientEvent('esx:showNotification', source,
            isVehicle and "~g~"..data.label.." comprado! Retiralo en el hangar."
                      or  "~g~Compra OK! Retira "..qty.."x "..data.label.." en el hangar.")
        print(string.format("^2[NEXUS]^7 %s compro %s x%d $%d orderId=%d",
            xp.getName(), data.item, qty, total, orderId))
        cb({success=true, orderId=orderId, balance=newBal, isVehicle=isVehicle})
end)

-- ══════════════════════════════════════════════════════════════
-- removeAdCB
-- pending+item  → devolver item (nunca fue al hangar)
-- active+item   → crear orden pending para retirar en hangar
-- active+veh    → despawnear lote
-- pending+veh   → solo cancelar
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:removeAdCB', function(source, cb, listingId)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({success=false,reason='Sin jugador'}); return end
        local rows = MySQL.query.await(
            'SELECT * FROM marketplace_listings WHERE id=? AND citizenid=?',
            { listingId, xp.identifier })
        local row = rows and rows[1] or nil
        if not row then cb({success=false,reason='No encontrada'}); return end

        if row.status == 'active' and row.is_vehicle == 1 then
            TriggerClientEvent('marketplace:client:listingPurchased',-1,listingId,row.label,0)
        elseif row.status == 'active' and row.is_vehicle == 0 then
            -- Item entregado al hangar → orden tipo 'returned' para retirar
            MySQL.insert.await(
                'INSERT INTO marketplace_orders (citizenid,listing_id,item,label,price,qty,is_vehicle,order_type,status) VALUES (?,?,?,?,0,?,0,"returned","pending")',
                { xp.identifier, tostring(row.id), row.item, row.label, row.qty })
            TriggerClientEvent('esx:showNotification', source,
                "~y~Publicacion cancelada. Tu item esta disponible en el NPC del hangar (Items devueltos).")
        elseif row.status == 'pending' and row.is_vehicle == 0 then
            -- Item nunca fue al hangar → devolver directo
            _GiveItem(xp, row.item, row.qty)
            TriggerClientEvent('esx:showNotification', source,
                "~y~Publicacion cancelada. Te devolvimos "..row.qty.."x "..row.label..".")
        else
            TriggerClientEvent('esx:showNotification', source, "~y~Publicacion cancelada.")
        end

        MySQL.update.await('UPDATE marketplace_listings SET status="cancelled" WHERE id=?',{listingId})
        for i, l in ipairs(activeListings) do
            if tostring(l.dbId) == tostring(listingId) then table.remove(activeListings,i); break end
        end
        _BroadcastListings()
        cb({success=true})
end)

-- ══════════════════════════════════════════════════════════════
-- activateListingCB — entregar item al hangar (ServerCallback con feedback)
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:activateListingCB', function(source, cb, listingId, isVehicle)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({success=false,reason='Sin jugador'}); return end
        local rows = MySQL.query.await(
            'SELECT * FROM marketplace_listings WHERE id=? AND citizenid=? AND status="pending"',
            { listingId, xp.identifier })
        local row = rows and rows[1] or nil
        if not row then cb({success=false,reason='Publicacion no encontrada'}); return end

        if not isVehicle then
            -- Verificar y sacar item del inventario
            local hasItem = false
            for _, inv in pairs(xp.getInventory()) do
                if inv.name == row.item and inv.count >= row.qty then hasItem=true; break end
            end
            if not hasItem then
                cb({success=false,reason='No tenes '..row.qty..'x '..row.label..' en el inventario'}); return
            end
            if not _TakeItem(xp, row.item, row.qty) then
                cb({success=false,reason='Error al sacar el item del inventario'}); return
            end
        end

        local slot = isVehicle and _GetNextVehicleSlot() or nil
        MySQL.update.await(
            'UPDATE marketplace_listings SET status="active", vehicle_slot=? WHERE id=?',
            { slot, listingId })

        local listing = _RowToListing(row)
        listing.status      = 'active'
        listing.vehicleSlot = slot
        table.insert(activeListings, listing)
        TriggerClientEvent('marketplace:client:listingActivated',-1,listingId,listing)
        _BroadcastListings()
        print(string.format("^2[NEXUS]^7 Listing #%d ACTIVO %s por %s", listingId, row.item, xp.getName()))
        cb({success=true})
end)

-- activateListing — NetEvent para vehículos (fire-and-forget)
RegisterNetEvent('marketplace:server:activateListing')
AddEventHandler('marketplace:server:activateListing', function(listingId, isVehicle)
    local _src = source
    local xp   = ESX.GetPlayerFromId(_src)
    if not xp then return end
    local rows = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE id=? AND citizenid=? AND status="pending"',
        { listingId, xp.identifier })
    local row = rows and rows[1] or nil
    if not row then
        TriggerClientEvent('esx:showNotification',_src,"~r~Publicacion no encontrada.")
        return
    end
    local slot = _GetNextVehicleSlot()
    MySQL.update.await('UPDATE marketplace_listings SET status="active", vehicle_slot=? WHERE id=?',{slot,listingId})
    local listing = _RowToListing(row)
    listing.status='active'; listing.vehicleSlot=slot
    table.insert(activeListings, listing)
    TriggerClientEvent('marketplace:client:listingActivated',-1,listingId,listing)
    _BroadcastListings()
    TriggerClientEvent('esx:showNotification',_src,"~g~Vehiculo expuesto en el lote del hangar!")
    print(string.format("^2[NEXUS]^7 Listing #%d ACTIVO veh %s por %s",listingId,row.item,xp.getName()))
end)

-- ══════════════════════════════════════════════════════════════
-- getPendingListings
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:getPendingListings', function(source, cb)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({}); return end
    local rows = MySQL.query.await(
        'SELECT * FROM marketplace_listings WHERE citizenid=? AND status="pending"',
        { xp.identifier }) or {}
    local result = {}
    for _, r in ipairs(rows) do table.insert(result, _RowToListing(r)) end
    cb(result)
end)

-- ══════════════════════════════════════════════════════════════
-- getMyPurchases — Citizen.CreateThread para que .await funcione
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:getMyPurchases', function(source, cb)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({ purchases={}, returned={} }); return end
    local rows = MySQL.query.await(
        'SELECT * FROM marketplace_orders WHERE citizenid=? AND status="pending" ORDER BY created_at DESC',
        { xp.identifier }) or {}
    local purchases = {}
    local returned  = {}
    for _, r in ipairs(rows) do
        local entry = {
            orderId=r.id, item=r.item, label=r.label,
            price=r.price, qty=r.qty or 1, isVehicle=r.is_vehicle==1,
            orderType=r.order_type or 'purchase',
        }
        if (r.order_type or 'purchase') == 'returned' then
            table.insert(returned, entry)
        else
            table.insert(purchases, entry)
        end
    end
    cb({ purchases=purchases, returned=returned })
end)

-- ══════════════════════════════════════════════════════════════
-- markPickedUp — igual al v4 original que funcionaba
-- RegisterNetEvent + TriggerServerEvent (NO ServerCallback)
RegisterNetEvent('marketplace:server:markPickedUp')
AddEventHandler('marketplace:server:markPickedUp', function(orderId)
    local xPlayer = ESX.GetPlayerFromId(source)
    if not xPlayer then return end

    local row = MySQL.query.await([[
        SELECT * FROM marketplace_orders
        WHERE id = ? AND citizenid = ? AND status = 'pending'
    ]], { orderId, xPlayer.identifier })
    row = row and row[1] or nil
    if not row then
        TriggerClientEvent('esx:showNotification', source, "~r~Orden no encontrada.")
        return
    end

    MySQL.update.await('UPDATE marketplace_orders SET status = "completed" WHERE id = ?', { orderId })

    if row.is_vehicle == 0 then
        xPlayer.addInventoryItem(row.item, row.qty or 1)
        TriggerClientEvent('esx:showNotification', source,
            "~g~Retiraste " .. (row.qty or 1) .. "x " .. row.label .. "!")
        TriggerClientEvent('marketplace:client:pickupDone', source, true,
            "Retiraste " .. (row.qty or 1) .. "x " .. row.label .. "!")
    else
        local ok = _InsertVehicleGarage(xPlayer.identifier, row.item)
        if ok then
            TriggerClientEvent('esx:showNotification', source,
                "~g~" .. row.label .. " en tu garage!")
            TriggerClientEvent('marketplace:client:pickupDone', source, true,
                row.label .. " guardado en tu garage!")
        else
            MySQL.update.await('UPDATE marketplace_orders SET status = "pending" WHERE id = ?', { orderId })
            TriggerClientEvent('esx:showNotification', source,
                "~r~Error al registrar el vehiculo.")
            TriggerClientEvent('marketplace:client:pickupDone', source, false, "Error al registrar.")
        end
    end
end)

-- ══════════════════════════════════════════════════════════════
-- Favoritos
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('marketplace:server:saveFavourites')
AddEventHandler('marketplace:server:saveFavourites', function(citizenid, favourites)
    if not citizenid or not favourites then return end
    MySQL.query.await('DELETE FROM marketplace_favourites WHERE citizenid=?',{citizenid})
    if #favourites == 0 then return end
    local vals, params = {}, {}
    for _, fid in ipairs(favourites) do
        table.insert(vals,'(?,?)'); table.insert(params,citizenid); table.insert(params,tostring(fid))
    end
    MySQL.query.await('INSERT IGNORE INTO marketplace_favourites (citizenid,listing_id) VALUES '..table.concat(vals,','),params)
end)

-- ══════════════════════════════════════════════════════════════
-- Exhibition vehicles / Profile
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('marketplace:server:requestExhibitionVehicles')
AddEventHandler('marketplace:server:requestExhibitionVehicles', function()
    local vl = {}
    for _, l in ipairs(activeListings) do
        if l.isVehicle and l.vehicleModel and l.vehicleSlot then table.insert(vl,l) end
    end
    TriggerClientEvent('marketplace:client:spawnExhibitionVehicles', source, vl)
end)

RegisterNetEvent('marketplace:server:updateProfile')
AddEventHandler('marketplace:server:updateProfile', function() end)

-- ══════════════════════════════════════════════════════════════
-- Vehículos propios del jugador (para formulario de publicar)
-- ══════════════════════════════════════════════════════════════
ESX.RegisterServerCallback('marketplace:server:getOwnedVehicles', function(source, cb)
    local xp = ESX.GetPlayerFromId(source)
    if not xp then cb({}); return end
    local rows = MySQL.query.await(
        'SELECT vehicle, plate FROM player_vehicles WHERE owner=? AND stored=1 LIMIT 20',
        { xp.identifier }) or {}
    local vehicles = {}
    for _, v in ipairs(rows) do
        if v.vehicle and v.vehicle ~= '' then
            table.insert(vehicles, {
                name=v.vehicle,
                label=v.vehicle..' ('..(v.plate or '?')..')',
                count=1, isVehicle=true,
            })
        end
    end
    cb(vehicles)
end)

-- ══════════════════════════════════════════════════════════════
-- Comprar tablet + usable
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('perfecto_tablet:server:comprarObjetoTablet')
AddEventHandler('perfecto_tablet:server:comprarObjetoTablet', function()
    local _src = source
    local xp   = ESX.GetPlayerFromId(_src)
    if not xp then return end
    if _GetMoney(xp) >= 500 then
        _RemoveMoney(xp, 500)
        xp.addInventoryItem('tablet', 1)
        TriggerClientEvent('esx:showNotification',_src,"~g~Compraste una Tablet por $500")
    else
        TriggerClientEvent('esx:showNotification',_src,"~r~No tenes $500")
    end
end)

ESX.RegisterUsableItem('tablet', function(source)
    TriggerClientEvent('perfecto_tablet:client:usarTablet', source)
end)

RegisterNetEvent('marketplace:server:postAd')
AddEventHandler('marketplace:server:postAd', function() end)