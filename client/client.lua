--[[
    NEXUS MARKET — client.lua  v3.0
    ESX · ox_lib · ox_target

    PRESERVA TODO LO EXISTENTE:
    - Animación tablet (StartTabletAnimation / StopTabletAnimation)
    - OpenTabletUI con ESX.TriggerServerCallback
    - SpawnTabletNPC con ox_target (comprar + acceder)
    - Sistema de posicionamiento con raycast (/setTablet)
    - RegisterNUICallback 'close', 'purchase', 'marketplace:postAd'
    - CreateThread inicial + RegisterNetEvent para actualizar NPC
    - RegisterNetEvent perfecto_tablet:client:usarTablet

    AGREGA:
    - Hangar NPC receptor (recibe items y vehículos)
    - Armario del hangar (zona de retiro para compradores)
    - Spawn de vehículos freezeados en lote de exposición
    - NUI callbacks: marketplace:buyItem, marketplace:saveFavourites,
      marketplace:removeAd, marketplace:setHangarWaypoint, marketplace:updateProfile
    - Sincronización de listings a todos los clientes
    - Manejo de vehicleModel para spawn en lote
]]

local isVisible   = false
local isPlacing   = false
local ghostPed    = nil
local currentHeading = 0.0
local tabletNPC   = nil
local tabletProp  = nil

-- NPC del hangar (receptor)
local hangarNPC        = nil
local hangarLocker     = nil  -- blip del armario
local exposedVehicles  = {}   -- vehículos spawneados en el lote

-- ══════════════════════════════════════════════════════════════
-- CONFIG LOCAL (sincronizada con Config en config.lua)
-- ══════════════════════════════════════════════════════════════
-- Estas coords se definen aquí pero idealmente vendrían de Config.lua
local HANGAR_NPC_COORDS  = Config.HangarNPC    or vector4(-1336.5, -1279.8, 4.3, 178.0)
local HANGAR_LOCKER_COORDS = Config.HangarLocker or vector3(-1338.0, -1285.0, 4.3)
-- Slots donde se spawnean los vehículos en exposición (el lote del hangar)
local VEHICLE_SLOTS = Config.VehicleSlots or {
    vector4(-1326.0, -1280.0, 4.3, 90.0),
    vector4(-1326.0, -1284.5, 4.3, 90.0),
    vector4(-1326.0, -1289.0, 4.3, 90.0),
    vector4(-1326.0, -1293.5, 4.3, 90.0),
    vector4(-1326.0, -1298.0, 4.3, 90.0),
    vector4(-1326.0, -1302.5, 4.3, 90.0),
}

-- ══════════════════════════════════════════════════════════════
-- HELPERS GENERALES
-- ══════════════════════════════════════════════════════════════

local function Notify(msg, type)
    type = type or 'inform'
    if lib and lib.notify then
        lib.notify({ title = 'Nexus Market', description = msg, type = type })
    else
        ESX.ShowNotification(msg)
    end
end

-- ══════════════════════════════════════════════════════════════
-- ANIMACIÓN TABLET (PRESERVADO EXACTO)
-- ══════════════════════════════════════════════════════════════

local function StartTabletAnimation()
    local playerPed = PlayerPedId()
    local dict = "amb@world_human_seat_wall_tablet@female@base"
    local anim = "base"
    local propModel = `prop_cs_tablet`

    lib.requestAnimDict(dict)
    lib.requestModel(propModel)

    tabletProp = CreateObject(propModel, 0.0, 0.0, 0.0, true, true, false)
    AttachEntityToEntity(tabletProp, playerPed, GetPedBoneIndex(playerPed, 18905),
        0.12, 0.02, 0.03, -10.0, 0.0, 0.0, true, true, false, true, 1, true)
    TaskPlayAnim(playerPed, dict, anim, 8.0, -8.0, -1, 49, 0, false, false, false)
end

local function StopTabletAnimation()
    local playerPed = PlayerPedId()
    if DoesEntityExist(tabletProp) then
        DeleteEntity(tabletProp)
        tabletProp = nil
    end
    StopAnimTask(playerPed, "amb@world_human_seat_wall_tablet@female@base", "base", 1.0)
    ClearPedTasks(playerPed)
end

-- ══════════════════════════════════════════════════════════════
-- ABRIR UI (PRESERVADO, con playerData enriquecido)
-- ══════════════════════════════════════════════════════════════

local function OpenTabletUI()
    ESX.TriggerServerCallback('perfecto_tablet:getServerData', function(data)
        if not data then return end
        isVisible = true
        SetNuiFocus(true, true)
        SendNUIMessage({
            action     = 'open',
            balance    = data.money,
            inventory  = data.inventory,
            listings   = data.listings,
            favourites = data.favourites,
            orders     = data.orders,
            myListings = data.myListings,
            playerData = {
                name      = data.playerName,
                citizenid = data.citizenid,
                job       = data.job,
            },
            items = Config.Items
        })
    end)
end

-- ══════════════════════════════════════════════════════════════
-- SPAWN NPC TABLET (PRESERVADO EXACTO + mejoras menores)
-- ══════════════════════════════════════════════════════════════

function SpawnTabletNPC(data)
    local model = `a_m_m_prolhost_01`
    lib.requestModel(model)

    if DoesEntityExist(tabletNPC) then DeleteEntity(tabletNPC) end

    tabletNPC = CreatePed(4, model, data.x, data.y, data.z - 1.0, data.h, false, false)
    SetEntityInvincible(tabletNPC, true)
    SetBlockingOfNonTemporaryEvents(tabletNPC, true)
    FreezeEntityPosition(tabletNPC, true)

    lib.requestAnimDict("amb@world_human_clipboard@male@idle_a")
    TaskPlayAnim(tabletNPC, "amb@world_human_clipboard@male@idle_a", "idle_c",
        8.0, -8.0, -1, 1, 0, false, false, false)

    exports.ox_target:addLocalEntity(tabletNPC, {
        {
            name    = 'comprar_tablet',
            icon    = 'fa-solid fa-cart-shopping',
            label   = 'Comprar Tablet ($500)',
            onSelect = function()
                TriggerServerEvent('perfecto_tablet:server:comprarObjetoTablet')
            end
        },
        {
            name    = 'abrir_tablet',
            icon    = 'fa-solid fa-tablet-screen-button',
            label   = 'Acceder a la Tablet',
            onSelect = function()
                OpenTabletUI()
            end
        }
    })
end

-- ══════════════════════════════════════════════════════════════
-- SPAWN NPC HANGAR (NUEVO — receptor de items y vehículos)
-- ══════════════════════════════════════════════════════════════

local function SpawnHangarNPC()
    local model = `s_m_y_airworker`
    lib.requestModel(model)

    if DoesEntityExist(hangarNPC) then DeleteEntity(hangarNPC) end

    local c = HANGAR_NPC_COORDS
    hangarNPC = CreatePed(4, model, c.x, c.y, c.z - 1.0, c.w, false, false)
    SetEntityInvincible(hangarNPC, true)
    SetBlockingOfNonTemporaryEvents(hangarNPC, true)
    FreezeEntityPosition(hangarNPC, true)

    lib.requestAnimDict("amb@world_human_clipboard@male@idle_a")
    TaskPlayAnim(hangarNPC, "amb@world_human_clipboard@male@idle_a", "idle_c",
        8.0, -8.0, -1, 1, 0, false, false, false)

    exports.ox_target:addLocalEntity(hangarNPC, {
        {
            name    = 'hangar_entregar_item',
            icon    = 'fa-solid fa-box-open',
            label   = 'Entregar item (activar publicación)',
            onSelect = function()
                _EntregarItem()
            end
        },
        {
            name    = 'hangar_entregar_vehiculo',
            icon    = 'fa-solid fa-car',
            label   = 'Entregar vehículo (activar publicación)',
            onSelect = function()
                _EntregarVehiculo()
            end
        },
        {
            name    = 'hangar_ver_armario',
            icon    = 'fa-solid fa-warehouse',
            label   = 'Ver armario de retiros',
            onSelect = function()
                _AbrirArmario()
            end
        },
    })
end

-- ── Entregar item al hangar ──────────────────────────────────
function _EntregarItem()
    -- Pedimos al server las publicaciones pendientes del jugador
    ESX.TriggerServerCallback('marketplace:server:getPendingListings', function(listings)
        if not listings or #listings == 0 then
            Notify('No tenés publicaciones pendientes de items.', 'error')
            return
        end

        -- Construir opciones para ox_lib menu
        local options = {}
        for _, l in ipairs(listings) do
            if not l.isVehicle then
                table.insert(options, {
                    title    = l.label,
                    description = 'Precio: $' .. l.price .. ' · Qty: ' .. l.qty,
                    onSelect = function()
                        _ConfirmarEntregaItem(l)
                    end
                })
            end
        end

        if #options == 0 then
            Notify('No tenés publicaciones de items pendientes.', 'error')
            return
        end

        lib.registerContext({
            id      = 'nexus_entregar_item',
            title   = 'Seleccioná qué publicación activar',
            options = options
        })
        lib.showContext('nexus_entregar_item')
    end)
end

function _ConfirmarEntregaItem(listing)
    -- Barra de progreso mientras "entrega" el item
    if lib.progressBar({
        duration = 4000,
        label    = 'Entregando ' .. listing.label .. ' al NPC...',
        useWhileDead = false,
        canCancel    = true,
        disable      = { car = true, move = true, combat = true },
    }) then
        TriggerServerEvent('marketplace:server:activateListing', listing.id, false)
        Notify('¡Publicación activada! ' .. listing.label .. ' ya está en el mercado.', 'success')
    else
        Notify('Entrega cancelada.', 'error')
    end
end

-- ── Entregar vehículo al hangar ──────────────────────────────
function _EntregarVehiculo()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if not DoesEntityExist(vehicle) or vehicle == 0 then
        Notify('Tenés que estar dentro del vehículo que querés publicar.', 'error')
        return
    end

    -- Verificar que es su publicación pendiente
    ESX.TriggerServerCallback('marketplace:server:getPendingListings', function(listings)
        if not listings or #listings == 0 then
            Notify('No tenés publicaciones pendientes de vehículos.', 'error')
            return
        end

        local vehicleModel = GetEntityModel(vehicle)
        local matchedListing = nil

        for _, l in ipairs(listings) do
            if l.isVehicle then
                local modelHash = GetHashKey(l.item)
                if modelHash == vehicleModel then
                    matchedListing = l
                    break
                end
            end
        end

        if not matchedListing then
            Notify('Este vehículo no coincide con ninguna de tus publicaciones pendientes.', 'error')
            return
        end

        if lib.progressBar({
            duration = 5000,
            label    = 'Entregando vehículo al hangar...',
            useWhileDead = false,
            canCancel    = true,
            disable      = { car = true, move = true, combat = true },
        }) then
            -- Sacar al jugador del vehículo
            TaskLeaveVehicle(PlayerPedId(), vehicle, 0)
            Wait(1500)

            -- El server activa el listing y notifica a todos para que spawneé el vehículo
            TriggerServerEvent('marketplace:server:activateListing', matchedListing.id, true)

            -- Eliminamos el vehículo del jugador (lo "entregamos")
            DeleteEntity(vehicle)
            Notify('¡Vehículo entregado! Quedará expuesto en el lote del hangar.', 'success')
        else
            Notify('Entrega cancelada.', 'error')
        end
    end)
end

-- ── Abrir armario de retiros ─────────────────────────────────
function _AbrirArmario()
    ESX.TriggerServerCallback('marketplace:server:getMyPurchases', function(purchases)
        if not purchases or #purchases == 0 then
            Notify('No tenés compras pendientes de retiro.', 'error')
            return
        end

        local options = {}
        for _, p in ipairs(purchases) do
            table.insert(options, {
                title       = p.label,
                description = 'Pagado: $' .. p.price,
                onSelect    = function()
                    _RetirarItem(p)
                end
            })
        end

        lib.registerContext({
            id      = 'nexus_armario',
            title   = '🗄️ Armario de Retiros',
            options = options
        })
        lib.showContext('nexus_armario')
    end)
end

function _RetirarItem(purchase)
    if purchase.isVehicle then
        -- Spawnear vehículo frente al jugador
        local playerPed = PlayerPedId()
        local coords    = GetEntityCoords(playerPed)
        local heading   = GetEntityHeading(playerPed)
        local spawnPos  = vector3(
            coords.x + math.sin(-math.rad(heading)) * 5.0,
            coords.y + math.cos(-math.rad(heading)) * 5.0,
            coords.z
        )

        lib.requestModel(GetHashKey(purchase.item))
        local veh = CreateVehicle(GetHashKey(purchase.item), spawnPos.x, spawnPos.y, spawnPos.z, heading, true, false)
        SetVehicleNumberPlateText(veh, 'NEXUS')
        SetPedIntoVehicle(PlayerPedId(), veh, -1)
        TriggerServerEvent('marketplace:server:markPickedUp', purchase.orderId)
        Notify('¡Vehículo entregado!', 'success')
    else
        -- Dar item directamente
        TriggerServerEvent('marketplace:server:markPickedUp', purchase.orderId)
        Notify('¡Items retirados del armario!', 'success')
    end
end

-- ══════════════════════════════════════════════════════════════
-- SPAWN VEHÍCULOS EXPOSICIÓN (freezeados en el lote)
-- ══════════════════════════════════════════════════════════════

local function SpawnExhibitionVehicle(vehicleModel, slotIndex, listingId)
    local slot = VEHICLE_SLOTS[slotIndex]
    if not slot then return end

    lib.requestModel(GetHashKey(vehicleModel))
    local veh = CreateVehicle(GetHashKey(vehicleModel), slot.x, slot.y, slot.z, slot.w, false, false)

    SetEntityInvincible(veh, true)
    SetVehicleDoorsLocked(veh, 4)        -- Bloqueado
    FreezeEntityPosition(veh, true)      -- Freezeado
    SetEntityAsMissionEntity(veh, true, true)
    SetVehicleNumberPlateText(veh, 'EN VENTA')

    -- Guardar referencia para poder borrar cuando se venda
    exposedVehicles[tostring(listingId)] = veh

    -- Blip en el mapa
    local blip = AddBlipForCoord(slot.x, slot.y, slot.z)
    SetBlipSprite(blip, 225)
    SetBlipDisplay(blip, 4)
    SetBlipScale(blip, 0.7)
    SetBlipColour(blip, 3)
    BeginTextCommandSetBlipName("STRING")
    AddTextComponentString("Vehículo en venta · " .. vehicleModel)
    EndTextCommandSetBlipName(blip)

    -- Target en el vehículo para verlo en la tablet
    exports.ox_target:addLocalEntity(veh, {
        {
            name    = 'ver_vehiculo_' .. tostring(listingId),
            icon    = 'fa-solid fa-magnifying-glass',
            label   = 'Ver en el mercado',
            onSelect = function()
                OpenTabletUI()
            end
        }
    })

    return veh
end

local function DespawnExhibitionVehicle(listingId)
    local veh = exposedVehicles[tostring(listingId)]
    if DoesEntityExist(veh) then
        DeleteEntity(veh)
    end
    exposedVehicles[tostring(listingId)] = nil
end

-- ══════════════════════════════════════════════════════════════
-- SISTEMA DE POSICIONAMIENTO /setTablet (PRESERVADO EXACTO)
-- ══════════════════════════════════════════════════════════════

function GetGroundAtCamera()
    local camCoords   = GetGameplayCamCoords()
    local camRotation = GetGameplayCamRot(2)
    local adj = vector3(
        (math.pi / 180) * camRotation.x,
        (math.pi / 180) * camRotation.y,
        (math.pi / 180) * camRotation.z
    )
    local forwardVector = vector3(
        -math.sin(adj.z) * math.abs(math.cos(adj.x)),
         math.cos(adj.z) * math.abs(math.cos(adj.x)),
         math.sin(adj.x)
    )
    local destination = camCoords + forwardVector * 10.0
    local rayHandle   = StartShapeTestRay(camCoords.x, camCoords.y, camCoords.z,
        destination.x, destination.y, destination.z, 17, PlayerPedId(), 0)
    local _, hit, endCoords, _, _ = GetShapeTestResult(rayHandle)
    return hit, endCoords
end

RegisterCommand('setTablet', function()
    if isPlacing then return end
    local model = `a_m_m_prolhost_01`
    lib.requestModel(model)
    isPlacing = true

    ghostPed = CreatePed(2, model, 0.0, 0.0, 0.0, 0.0, false, false)
    SetEntityAlpha(ghostPed, 150, false)
    SetEntityCollision(ghostPed, false, false)
    SetBlockingOfNonTemporaryEvents(ghostPed, true)

    CreateThread(function()
        while isPlacing do
            Wait(0)
            local hit, groundCoords = GetGroundAtCamera()
            if hit then
                SetEntityCoords(ghostPed, groundCoords.x, groundCoords.y, groundCoords.z)
                SetEntityHeading(ghostPed, currentHeading)
            end
            lib.showTextUI('[E] Confirmar | [G] Cancelar | [←/→] Rotar', { position = "top-center" })
            if IsControlPressed(0, 174) then currentHeading = currentHeading + 2.0 end
            if IsControlPressed(0, 175) then currentHeading = currentHeading - 2.0 end
            if IsControlJustPressed(0, 38) then -- E
                TriggerServerEvent('perfecto_tablet:server:guardarNPC',
                    GetEntityCoords(ghostPed), GetEntityHeading(ghostPed))
                isPlacing = false
                DeleteEntity(ghostPed)
                lib.hideTextUI()
            end
            if IsControlJustPressed(0, 47) then -- G
                isPlacing = false
                DeleteEntity(ghostPed)
                lib.hideTextUI()
            end
        end
    end)
end)

-- Comando para posicionar el NPC del hangar
RegisterCommand('setHangar', function()
    if isPlacing then return end
    local model = `s_m_y_airworker`
    lib.requestModel(model)
    isPlacing = true

    ghostPed = CreatePed(2, model, 0.0, 0.0, 0.0, 0.0, false, false)
    SetEntityAlpha(ghostPed, 150, false)
    SetEntityCollision(ghostPed, false, false)
    SetBlockingOfNonTemporaryEvents(ghostPed, true)

    CreateThread(function()
        while isPlacing do
            Wait(0)
            local hit, groundCoords = GetGroundAtCamera()
            if hit then
                SetEntityCoords(ghostPed, groundCoords.x, groundCoords.y, groundCoords.z)
                SetEntityHeading(ghostPed, currentHeading)
            end
            lib.showTextUI('[E] Confirmar hangar | [G] Cancelar | [←/→] Rotar', { position = "top-center" })
            if IsControlPressed(0, 174) then currentHeading = currentHeading + 2.0 end
            if IsControlPressed(0, 175) then currentHeading = currentHeading - 2.0 end
            if IsControlJustPressed(0, 38) then
                TriggerServerEvent('marketplace:server:guardarHangarNPC',
                    GetEntityCoords(ghostPed), GetEntityHeading(ghostPed))
                isPlacing = false
                DeleteEntity(ghostPed)
                lib.hideTextUI()
            end
            if IsControlJustPressed(0, 47) then
                isPlacing = false
                DeleteEntity(ghostPed)
                lib.hideTextUI()
            end
        end
    end)
end)

-- ══════════════════════════════════════════════════════════════
-- NUI CALLBACKS (PRESERVADOS + NUEVOS)
-- ══════════════════════════════════════════════════════════════

-- PRESERVADO
RegisterNUICallback('close', function(data, cb)
    isVisible = false
    SetNuiFocus(false, false)
    StopTabletAnimation()
    cb('ok')
end)

-- PRESERVADO
RegisterNUICallback('purchase', function(data, cb)
    TriggerServerEvent('marketplace:purchase', data.items, data.total)
    cb({ success = true })
end)

-- PRESERVADO
RegisterNUICallback('marketplace:postAd', function(data, cb)
    TriggerServerEvent('marketplace:server:postAd', data, function(result)
        cb(result or { success = true })
    end)
end)

-- NUEVO — Comprar item (descuenta banco, da item o encola para retiro)
RegisterNUICallback('marketplace:buyItem', function(data, cb)
    TriggerServerEvent('marketplace:server:buyItem', data, function(result)
        cb(result or { success = false, reason = 'Sin respuesta del server' })
    end)
end)

-- NUEVO — Guardar favoritos persistentes
RegisterNUICallback('marketplace:saveFavourites', function(data, cb)
    TriggerServerEvent('marketplace:server:saveFavourites', data.citizenid, data.favourites)
    cb('ok')
end)

-- NUEVO — Eliminar publicación
RegisterNUICallback('marketplace:removeAd', function(data, cb)
    TriggerServerEvent('marketplace:server:removeAd', data.listingId, function(result)
        cb(result or { success = true })
    end)
end)

-- NUEVO — Marcar waypoint del hangar en el mapa
RegisterNUICallback('marketplace:setHangarWaypoint', function(data, cb)
    local c = HANGAR_NPC_COORDS
    SetNewWaypoint(c.x, c.y)
    Notify('Waypoint marcado en el hangar.', 'inform')
    cb('ok')
end)

-- NUEVO — Actualizar perfil
RegisterNUICallback('marketplace:updateProfile', function(data, cb)
    TriggerServerEvent('marketplace:server:updateProfile', data)
    cb('ok')
end)

-- ══════════════════════════════════════════════════════════════
-- NET EVENTS DESDE EL SERVER
-- ══════════════════════════════════════════════════════════════

-- Listing activado (server lo confirmó)
RegisterNetEvent('marketplace:client:listingActivated')
AddEventHandler('marketplace:client:listingActivated', function(listingId, listing)
    SendNUIMessage({
        action    = 'listingActivated',
        listingId = listingId,
        listing   = listing,
    })
    -- Si es vehículo, spawnearlo en el lote
    if listing and listing.isVehicle and listing.vehicleModel then
        local slotIndex = listing.vehicleSlot or 1
        SpawnExhibitionVehicle(listing.vehicleModel, slotIndex, listingId)
    end
end)

-- Listing vendido / comprado
RegisterNetEvent('marketplace:client:listingPurchased')
AddEventHandler('marketplace:client:listingPurchased', function(listingId, label, price)
    SendNUIMessage({
        action    = 'listingPurchased',
        listingId = listingId,
        label     = label,
        price     = price,
    })
    -- Si había un vehículo en exposición, removerlo
    DespawnExhibitionVehicle(listingId)
end)

-- Balance actualizado desde el server
RegisterNetEvent('marketplace:client:updateBalance')
AddEventHandler('marketplace:client:updateBalance', function(newBalance)
    SendNUIMessage({ action = 'updateBalance', balance = newBalance })
end)

-- Listings actualizados (broadcast a todos)
RegisterNetEvent('marketplace:client:updateListings')
AddEventHandler('marketplace:client:updateListings', function(listings)
    SendNUIMessage({ action = 'updateListings', listings = listings })
end)

-- Spawnear vehículo de exposición recibido del server al iniciar
RegisterNetEvent('marketplace:client:spawnExhibitionVehicles')
AddEventHandler('marketplace:client:spawnExhibitionVehicles', function(vehicleListings)
    for _, l in ipairs(vehicleListings) do
        if l.vehicleModel then
            SpawnExhibitionVehicle(l.vehicleModel, l.vehicleSlot or 1, l.id)
        end
    end
end)

-- PRESERVADO
RegisterNetEvent('perfecto_tablet:client:actualizarNPC')
AddEventHandler('perfecto_tablet:client:actualizarNPC', function(data)
    SpawnTabletNPC(data)
end)

-- PRESERVADO
RegisterNetEvent('perfecto_tablet:client:usarTablet')
AddEventHandler('perfecto_tablet:client:usarTablet', function()
    if isVisible then return end
    StartTabletAnimation()
    if lib.progressBar({
        duration     = 3000,
        label        = 'Encendiendo Tablet...',
        useWhileDead = false,
        canCancel    = true,
        disable      = { car = true, move = true, combat = true },
        anim = {
            dict = "amb@world_human_seat_wall_tablet@female@base",
            clip = "base"
        },
    }) then
        OpenTabletUI()
    else
        StopTabletAnimation()
        Notify('Cancelado', 'error')
    end
end)

-- ══════════════════════════════════════════════════════════════
-- CARGA INICIAL
-- ══════════════════════════════════════════════════════════════

CreateThread(function()
    Wait(1500)

    -- Spawn NPC tablet (preservado)
    ESX.TriggerServerCallback('perfecto_tablet:server:getNPCCoords', function(data)
        if data then SpawnTabletNPC(data) end
    end)

    -- Spawn NPC hangar
    SpawnHangarNPC()

    -- Pedir vehículos activos en exposición para sincronizar
    TriggerServerEvent('marketplace:server:requestExhibitionVehicles')
end)
