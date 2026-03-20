--[[
    NEXUS MARKET — client.lua  v7.0
    ESX · ox_lib · ox_target

    CAMBIO CLAVE v7:
    markPickedUp → ESX.TriggerServerCallback (no TriggerServerEvent)
    → el source/xPlayer no se pierde en async del server
]]

local isVisible       = false
local isPlacing       = false
local ghostPed        = nil
local currentHeading  = 0.0
local tabletNPC       = nil
local tabletProp      = nil
local hangarNPC       = nil
local exposedVehicles = {}

local HANGAR_NPC_COORDS = Config.HangarNPC    or vector4(-1336.5, -1279.8, 4.3, 178.0)
local VEHICLE_SLOTS     = Config.VehicleSlots or {
    vector4(-1326.0, -1280.0, 4.3, 90.0),
    vector4(-1326.0, -1284.5, 4.3, 90.0),
    vector4(-1326.0, -1289.0, 4.3, 90.0),
    vector4(-1326.0, -1293.5, 4.3, 90.0),
    vector4(-1326.0, -1298.0, 4.3, 90.0),
    vector4(-1326.0, -1302.5, 4.3, 90.0),
}

-- ══════════════════════════════════════════════════════════════
-- HELPERS
-- ══════════════════════════════════════════════════════════════
local function Notify(msg, ntype)
    ntype = ntype or 'inform'
    if lib and lib.notify then
        lib.notify({ title='Nexus Market', description=msg, type=ntype })
    else
        ESX.ShowNotification(msg)
    end
end

-- ══════════════════════════════════════════════════════════════
-- ANIMACIÓN TABLET — PRESERVADO EXACTO
-- ══════════════════════════════════════════════════════════════
local function StartTabletAnimation()
    local ped = PlayerPedId()
    lib.requestAnimDict("amb@world_human_seat_wall_tablet@female@base")
    lib.requestModel(`prop_cs_tablet`)
    tabletProp = CreateObject(`prop_cs_tablet`, 0, 0, 0, true, true, false)
    AttachEntityToEntity(tabletProp, ped, GetPedBoneIndex(ped, 18905),
        0.12, 0.02, 0.03, -10.0, 0.0, 0.0, true, true, false, true, 1, true)
    TaskPlayAnim(ped, "amb@world_human_seat_wall_tablet@female@base", "base",
        8.0, -8.0, -1, 49, 0, false, false, false)
end

local function StopTabletAnimation()
    local ped = PlayerPedId()
    if DoesEntityExist(tabletProp) then DeleteEntity(tabletProp); tabletProp=nil end
    StopAnimTask(ped, "amb@world_human_seat_wall_tablet@female@base", "base", 1.0)
    ClearPedTasks(ped)
end

-- ══════════════════════════════════════════════════════════════
-- ABRIR UI
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
            listings   = data.listings   or {},
            favourites = data.favourites or {},
            orders     = data.orders     or {},
            myListings = data.myListings or {},
            profile    = data.profile    or {},
            playerData = { name=data.playerName, citizenid=data.citizenid, job=data.job or '' },
            items      = Config.Items,
        })
    end)
end

-- ══════════════════════════════════════════════════════════════
-- NPC TABLET — PRESERVADO EXACTO
-- ══════════════════════════════════════════════════════════════
function SpawnTabletNPC(data)
    lib.requestModel(`a_m_m_prolhost_01`)
    if DoesEntityExist(tabletNPC) then DeleteEntity(tabletNPC) end
    tabletNPC = CreatePed(4, `a_m_m_prolhost_01`, data.x, data.y, data.z-1.0, data.h, false, false)
    SetEntityInvincible(tabletNPC, true)
    SetBlockingOfNonTemporaryEvents(tabletNPC, true)
    FreezeEntityPosition(tabletNPC, true)
    lib.requestAnimDict("amb@world_human_clipboard@male@idle_a")
    TaskPlayAnim(tabletNPC, "amb@world_human_clipboard@male@idle_a", "idle_c",
        8.0, -8.0, -1, 1, 0, false, false, false)
    exports.ox_target:addLocalEntity(tabletNPC, {
        { name='comprar_tablet', icon='fa-solid fa-cart-shopping', label='Comprar Tablet ($500)',
          onSelect=function() TriggerServerEvent('perfecto_tablet:server:comprarObjetoTablet') end },
        { name='abrir_tablet',  icon='fa-solid fa-tablet-screen-button', label='Acceder a la Tablet',
          onSelect=function() OpenTabletUI() end },
    })
end

-- ══════════════════════════════════════════════════════════════
-- NPC HANGAR
-- ══════════════════════════════════════════════════════════════
local function SpawnHangarNPC()
    lib.requestModel(`s_m_y_airworker`)
    if DoesEntityExist(hangarNPC) then DeleteEntity(hangarNPC) end
    local c = HANGAR_NPC_COORDS
    hangarNPC = CreatePed(4, `s_m_y_airworker`, c.x, c.y, c.z-1.0, c.w, false, false)
    SetEntityInvincible(hangarNPC, true)
    SetBlockingOfNonTemporaryEvents(hangarNPC, true)
    FreezeEntityPosition(hangarNPC, true)
    lib.requestAnimDict("amb@world_human_clipboard@male@idle_a")
    TaskPlayAnim(hangarNPC, "amb@world_human_clipboard@male@idle_a", "idle_c",
        8.0, -8.0, -1, 1, 0, false, false, false)
    exports.ox_target:addLocalEntity(hangarNPC, {
        { name='hangar_item',    icon='fa-solid fa-box-open',  label='Entregar item',
          onSelect=function() _EntregarItem() end },
        { name='hangar_veh',     icon='fa-solid fa-car',       label='Entregar vehículo',
          onSelect=function() _EntregarVehiculo() end },
        { name='hangar_armario', icon='fa-solid fa-warehouse', label='Retirar mis compras',
          onSelect=function() _AbrirArmario() end },
    })
end

-- ══════════════════════════════════════════════════════════════
-- ENTREGAR ITEM
-- ══════════════════════════════════════════════════════════════
function _EntregarItem()
    ESX.TriggerServerCallback('marketplace:server:getPendingListings', function(listings)
        if not listings or #listings == 0 then
            Notify('No tenés publicaciones de items pendientes.', 'error'); return
        end
        local options = {}
        for _, l in ipairs(listings) do
            if not l.isVehicle then
                local listing = l
                table.insert(options, {
                    title       = listing.label,
                    description = '$'..listing.price..' c/u · Stock: x'..listing.qty,
                    onSelect    = function()
                        if lib.progressBar({
                            duration=4000, label='Entregando '..listing.label..'...',
                            useWhileDead=false, canCancel=true,
                            disable={ car=true, move=true, combat=true },
                        }) then
                            ESX.TriggerServerCallback('marketplace:server:activateListingCB',
                                function(result)
                                    if result and result.success then
                                        Notify('Publicacion activa! '..listing.label, 'success')
                                    else
                                        Notify('Error: '..(result and result.reason or 'desconocido'), 'error')
                                    end
                                end, listing.dbId or listing.id, false)
                        else
                            Notify('Cancelado.', 'error')
                        end
                    end
                })
            end
        end
        if #options == 0 then Notify('No tenés publicaciones de items pendientes.', 'error'); return end
        lib.registerContext({ id='nexus_entregar_item', title='¿Qué querés entregar?', options=options })
        lib.showContext('nexus_entregar_item')
    end)
end

-- ══════════════════════════════════════════════════════════════
-- ENTREGAR VEHÍCULO
-- ══════════════════════════════════════════════════════════════
function _EntregarVehiculo()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if not DoesEntityExist(vehicle) or vehicle == 0 then
        Notify('Tenés que estar DENTRO del vehículo.', 'error'); return
    end
    ESX.TriggerServerCallback('marketplace:server:getPendingListings', function(listings)
        if not listings or #listings == 0 then
            Notify('No tenés publicaciones de vehículos pendientes.', 'error'); return
        end
        local vehicleModel   = GetEntityModel(vehicle)
        local matchedListing = nil
        for _, l in ipairs(listings) do
            if l.isVehicle and GetHashKey(l.item) == vehicleModel then
                matchedListing = l; break
            end
        end
        if not matchedListing then
            Notify('Este vehículo no coincide con ninguna publicación tuya.', 'error'); return
        end
        if lib.progressBar({
            duration=5000, label='Entregando vehículo...',
            useWhileDead=false, canCancel=true,
            disable={ car=true, move=true, combat=true },
        }) then
            TaskLeaveVehicle(PlayerPedId(), vehicle, 0)
            Wait(1500)
            DeleteEntity(vehicle)
            TriggerServerEvent('marketplace:server:activateListing',
                matchedListing.dbId or matchedListing.id, true)
            Notify('Vehículo entregado! Está en el lote de exposición.', 'success')
        else
            Notify('Cancelado.', 'error')
        end
    end)
end

-- ══════════════════════════════════════════════════════════════
-- ARMARIO DE RETIROS
-- Dos secciones: Compras pendientes + Items devueltos
-- ══════════════════════════════════════════════════════════════
function _AbrirArmario()
    ESX.TriggerServerCallback('marketplace:server:getMyPurchases', function(data)
        -- data = { purchases={...}, returned={...} }
        local purchases = (data and data.purchases) or {}
        local returned  = (data and data.returned)  or {}

        if #purchases == 0 and #returned == 0 then
            Notify('No tenés nada pendiente de retiro.', 'error'); return
        end

        local function makeOption(p, label_prefix)
            local purchase = p
            local icon    = purchase.isVehicle and '🚗' or '📦'
            local qtyTxt  = (not purchase.isVehicle and purchase.qty > 1) and ' x'..purchase.qty or ''
            local priceStr = purchase.price > 0
                and 'Pagado: $'..tostring(purchase.price * (purchase.qty or 1))
                or  'Item devuelto — sin costo'
            return {
                title       = label_prefix..icon..' '..purchase.label..qtyTxt,
                description = priceStr..(purchase.isVehicle and ' · Va directo a tu garage' or ''),
                onSelect    = function()
                    lib.progressBar({
                        duration     = purchase.isVehicle and 5000 or 3000,
                        label        = 'Retirando '..purchase.label..'...',
                        useWhileDead = false,
                        canCancel    = false,
                        disable      = { car=true, move=true, combat=true },
                    })
                    -- Igual al v4 original: TriggerServerEvent simple
                    TriggerServerEvent('marketplace:server:markPickedUp', purchase.orderId)
                end
            }
        end

        local options = {}

        -- Sección: Compras pendientes
        if #purchases > 0 then
            table.insert(options, {
                title    = '── Compras pendientes ──',
                disabled = true,
            })
            for _, p in ipairs(purchases) do
                table.insert(options, makeOption(p, ''))
            end
        end

        -- Sección: Items devueltos (publicaciones canceladas que estaban en hangar)
        if #returned > 0 then
            table.insert(options, {
                title    = '── Items devueltos ──',
                disabled = true,
            })
            for _, p in ipairs(returned) do
                table.insert(options, makeOption(p, '↩ '))
            end
        end

        lib.registerContext({ id='nexus_armario', title='🗄️ Hangar — Retiros', options=options })
        lib.showContext('nexus_armario')
    end)
end

-- ══════════════════════════════════════════════════════════════
-- VEHÍCULOS DE EXPOSICIÓN
-- ══════════════════════════════════════════════════════════════
local function SpawnExhibitionVehicle(vehicleModel, slotIndex, listingId)
    local slot = VEHICLE_SLOTS[slotIndex]
    if not slot then return end
    lib.requestModel(GetHashKey(vehicleModel))
    local veh = CreateVehicle(GetHashKey(vehicleModel), slot.x, slot.y, slot.z, slot.w, false, false)
    SetEntityInvincible(veh, true)
    SetVehicleDoorsLocked(veh, 4)
    FreezeEntityPosition(veh, true)
    SetEntityAsMissionEntity(veh, true, true)
    SetVehicleNumberPlateText(veh, 'EN VENTA')
    exposedVehicles[tostring(listingId)] = veh
    local blip = AddBlipForCoord(slot.x, slot.y, slot.z)
    SetBlipSprite(blip, 225); SetBlipScale(blip, 0.75); SetBlipColour(blip, 3)
    BeginTextCommandSetBlipName("STRING")
    AddTextComponentString(vehicleModel..' - En venta')
    EndTextCommandSetBlipName(blip)
    exports.ox_target:addLocalEntity(veh, {
        { name='ver_veh_'..tostring(listingId), icon='fa-solid fa-magnifying-glass',
          label='Ver en el mercado', onSelect=function() OpenTabletUI() end }
    })
end

local function DespawnExhibitionVehicle(listingId)
    local veh = exposedVehicles[tostring(listingId)]
    if DoesEntityExist(veh) then DeleteEntity(veh) end
    exposedVehicles[tostring(listingId)] = nil
end

-- ══════════════════════════════════════════════════════════════
-- RAYCAST + COMANDOS — PRESERVADO EXACTO
-- ══════════════════════════════════════════════════════════════
function GetGroundAtCamera()
    local cc = GetGameplayCamCoords()
    local cr = GetGameplayCamRot(2)
    local adj = vector3((math.pi/180)*cr.x,(math.pi/180)*cr.y,(math.pi/180)*cr.z)
    local fwd = vector3(-math.sin(adj.z)*math.abs(math.cos(adj.x)),
                         math.cos(adj.z)*math.abs(math.cos(adj.x)),math.sin(adj.x))
    local dest = cc + fwd*10.0
    local ray = StartShapeTestRay(cc.x,cc.y,cc.z,dest.x,dest.y,dest.z,17,PlayerPedId(),0)
    local _,hit,endCoords = GetShapeTestResult(ray)
    return hit, endCoords
end

local function _PlacementLoop(model, label, onConfirm)
    lib.requestModel(model); isPlacing=true
    ghostPed = CreatePed(2,model,0,0,0,0,false,false)
    SetEntityAlpha(ghostPed,150,false); SetEntityCollision(ghostPed,false,false)
    SetBlockingOfNonTemporaryEvents(ghostPed,true)
    CreateThread(function()
        while isPlacing do
            Wait(0)
            local hit, gc = GetGroundAtCamera()
            if hit then SetEntityCoords(ghostPed,gc.x,gc.y,gc.z); SetEntityHeading(ghostPed,currentHeading) end
            lib.showTextUI('[E] '..label..' | [G] Cancelar | [←/→] Rotar',{position="top-center"})
            if IsControlPressed(0,174)    then currentHeading=currentHeading+2.0 end
            if IsControlPressed(0,175)    then currentHeading=currentHeading-2.0 end
            if IsControlJustPressed(0,38) then
                onConfirm(GetEntityCoords(ghostPed),GetEntityHeading(ghostPed))
                isPlacing=false; DeleteEntity(ghostPed); lib.hideTextUI()
            end
            if IsControlJustPressed(0,47) then
                isPlacing=false; DeleteEntity(ghostPed); lib.hideTextUI()
            end
        end
    end)
end

RegisterCommand('setTablet', function()
    if isPlacing then return end
    _PlacementLoop(`a_m_m_prolhost_01`,'Confirmar Tablet',function(coords,heading)
        TriggerServerEvent('perfecto_tablet:server:guardarNPC',coords,heading)
    end)
end)

RegisterCommand('setHangar', function()
    if isPlacing then return end
    _PlacementLoop(`s_m_y_airworker`,'Confirmar Hangar',function(coords,heading)
        TriggerServerEvent('marketplace:server:guardarHangarNPC',coords,heading)
    end)
end)

-- ══════════════════════════════════════════════════════════════
-- NUI CALLBACKS
-- ══════════════════════════════════════════════════════════════
RegisterNUICallback('close', function(data, cb)
    isVisible=false; SetNuiFocus(false,false); StopTabletAnimation(); cb({ok=true})
end)

RegisterNUICallback('purchase', function(data, cb)
    TriggerServerEvent('marketplace:purchase', data.items, data.total); cb({success=true})
end)

RegisterNUICallback('marketplace:postAd', function(data, cb)
    ESX.TriggerServerCallback('marketplace:server:postAdCB', function(res)
        cb(res or {success=false, reason='Sin respuesta'})
    end, data)
end)

RegisterNUICallback('marketplace:buyItem', function(data, cb)
    ESX.TriggerServerCallback('marketplace:server:buyItemCB', function(res)
        cb(res or {success=false, reason='Sin respuesta'})
    end, data)
end)

RegisterNUICallback('marketplace:removeAd', function(data, cb)
    ESX.TriggerServerCallback('marketplace:server:removeAdCB', function(res)
        cb(res or {success=false, reason='Sin respuesta'})
    end, data.listingId)
end)

RegisterNUICallback('marketplace:getOwnedVehicles', function(data, cb)
    ESX.TriggerServerCallback('marketplace:server:getOwnedVehicles', function(vehicles)
        cb({ vehicles = vehicles or {} })
    end)
end)

RegisterNUICallback('marketplace:saveFavourites', function(data, cb)
    TriggerServerEvent('marketplace:server:saveFavourites', data.citizenid, data.favourites)
    cb({ok=true})
end)

RegisterNUICallback('marketplace:setHangarWaypoint', function(data, cb)
    SetNewWaypoint(HANGAR_NPC_COORDS.x, HANGAR_NPC_COORDS.y)
    cb({ok=true})
end)

RegisterNUICallback('marketplace:updateProfile', function(data, cb)
    TriggerServerEvent('marketplace:server:updateProfile', data); cb({ok=true})
end)

-- ══════════════════════════════════════════════════════════════
-- NET EVENTS DESDE EL SERVER
-- ══════════════════════════════════════════════════════════════
RegisterNetEvent('marketplace:client:pickupDone')
AddEventHandler('marketplace:client:pickupDone', function(success, message)
    if success then
        Notify(message or 'Retirado!', 'success')
    else
        Notify('Error: '..(message or 'intenta de nuevo'), 'error')
    end
end)

RegisterNetEvent('marketplace:client:listingActivated')
AddEventHandler('marketplace:client:listingActivated', function(listingId, listing)
    SendNUIMessage({ action='listingActivated', listingId=listingId, listing=listing })
    if listing and listing.isVehicle and listing.vehicleModel then
        SpawnExhibitionVehicle(listing.vehicleModel, listing.vehicleSlot or 1, listingId)
    end
end)

RegisterNetEvent('marketplace:client:listingPurchased')
AddEventHandler('marketplace:client:listingPurchased', function(listingId, label, price)
    SendNUIMessage({ action='listingPurchased', listingId=listingId, label=label, price=price })
    DespawnExhibitionVehicle(listingId)
end)

RegisterNetEvent('marketplace:client:updateBalance')
AddEventHandler('marketplace:client:updateBalance', function(newBalance)
    SendNUIMessage({ action='updateBalance', balance=newBalance })
end)

RegisterNetEvent('marketplace:client:updateListings')
AddEventHandler('marketplace:client:updateListings', function(listings)
    SendNUIMessage({ action='updateListings', listings=listings })
end)

RegisterNetEvent('marketplace:client:spawnExhibitionVehicles')
AddEventHandler('marketplace:client:spawnExhibitionVehicles', function(vehicleListings)
    for _, l in ipairs(vehicleListings) do
        if l.vehicleModel then SpawnExhibitionVehicle(l.vehicleModel, l.vehicleSlot or 1, l.id) end
    end
end)

RegisterNetEvent('perfecto_tablet:client:actualizarNPC')
AddEventHandler('perfecto_tablet:client:actualizarNPC', function(data) SpawnTabletNPC(data) end)

RegisterNetEvent('perfecto_tablet:client:usarTablet')
AddEventHandler('perfecto_tablet:client:usarTablet', function()
    if isVisible then return end
    StartTabletAnimation()
    if lib.progressBar({
        duration=3000, label='Encendiendo Tablet...',
        useWhileDead=false, canCancel=true,
        disable={ car=true, move=true, combat=true },
        anim={ dict="amb@world_human_seat_wall_tablet@female@base", clip="base" },
    }) then
        OpenTabletUI()
    else
        StopTabletAnimation(); Notify('Cancelado','error')
    end
end)

-- ══════════════════════════════════════════════════════════════
-- CARGA INICIAL
-- ══════════════════════════════════════════════════════════════
CreateThread(function()
    Wait(1500)
    ESX.TriggerServerCallback('perfecto_tablet:server:getNPCCoords', function(data)
        if data then SpawnTabletNPC(data) end
    end)
    SpawnHangarNPC()
    TriggerServerEvent('marketplace:server:requestExhibitionVehicles')
end)