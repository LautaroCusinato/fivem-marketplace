local isVisible = false
local isPlacing = false
local ghostPed = nil
local currentHeading = 0.0
local tabletNPC = nil
local tabletProp = nil

-- === FUNCIONES DE APOYO ===

-- Animación para el jugador al abrir la tablet
local function StartTabletAnimation()
    local playerPed = PlayerPedId()
    local dict = "amb@world_human_seat_wall_tablet@female@base"
    local anim = "base"
    local propModel = `prop_cs_tablet`
    
    lib.requestAnimDict(dict)
    lib.requestModel(propModel)
    
    tabletProp = CreateObject(propModel, 0.0, 0.0, 0.0, true, true, false)
    AttachEntityToEntity(tabletProp, playerPed, GetPedBoneIndex(playerPed, 18905), 0.12, 0.02, 0.03, -10.0, 0.0, 0.0, true, true, false, true, 1, true)
    TaskPlayAnim(playerPed, dict, anim, 8.0, -8.0, -1, 49, 0, false, false, false)
end

-- Detener animación y borrar objeto
local function StopTabletAnimation()
    local playerPed = PlayerPedId()
    if DoesEntityExist(tabletProp) then
        DeleteEntity(tabletProp)
        tabletProp = nil
    end
    StopAnimTask(playerPed, "amb@world_human_seat_wall_tablet@female@base", "base", 1.0)
    ClearPedTasks(playerPed)
end

-- Función para abrir la interfaz
local function OpenTabletUI()
    ESX.TriggerServerCallback('perfecto_tablet:getServerData', function(data)
        if data then
            isVisible = true
            SetNuiFocus(true, true)
            StartTabletAnimation()
            SendNUIMessage({
                action = 'open',
                balance = data.money,
                inventory = data.inventory,
                items = Config.Items 
            })
        end
    end)
end

-- === SPAWN Y TARGET DEL NPC ===

function SpawnTabletNPC(data)
    local model = `a_m_m_prolhost_01`
    lib.requestModel(model)

    if DoesEntityExist(tabletNPC) then DeleteEntity(tabletNPC) end

    tabletNPC = CreatePed(4, model, data.x, data.y, data.z - 1.0, data.h, false, false)
    SetEntityInvincible(tabletNPC, true)
    SetBlockingOfNonTemporaryEvents(tabletNPC, true)
    FreezeEntityPosition(tabletNPC, true)

    lib.requestAnimDict("amb@world_human_clipboard@male@idle_a")
    TaskPlayAnim(tabletNPC, "amb@world_human_clipboard@male@idle_a", "idle_c", 8.0, -8.0, -1, 1, 0, false, false, false)

    exports.ox_target:addLocalEntity(tabletNPC, {
        {
            name = 'abrir_tablet',
            icon = 'fa-solid fa-tablet-screen-button',
            label = 'Acceder al Marketplace',
            onSelect = function()
                OpenTabletUI()
            end
        }
    })
end

-- === SISTEMA DE POSICIONAMIENTO (Raycast) ===

function GetGroundAtCamera()
    local camCoords = GetGameplayCamCoords()
    local camRotation = GetGameplayCamRot(2)
    local adj = vector3((math.pi / 180) * camRotation.x, (math.pi / 180) * camRotation.y, (math.pi / 180) * camRotation.z)
    local forwardVector = vector3(-math.sin(adj.z) * math.abs(math.cos(adj.x)), math.cos(adj.z) * math.abs(math.cos(adj.x)), math.sin(adj.x))
    local destination = camCoords + forwardVector * 10.0

    local rayHandle = StartShapeTestRay(camCoords.x, camCoords.y, camCoords.z, destination.x, destination.y, destination.z, 17, PlayerPedId(), 0)
    local _, hit, endCoords, _, _ = GetShapeTestResult(rayHandle)
    return hit, endCoords
end

-- === COMANDOS ===

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

            lib.showTextUI('[E] Confirmar | [G] Cancelar | [←/→] Rotar', {position = "top-center"})

            if IsControlPressed(0, 174) then currentHeading = currentHeading + 2.0 end
            if IsControlPressed(0, 175) then currentHeading = currentHeading - 2.0 end
            
            if IsControlJustPressed(0, 38) then -- E
                TriggerServerEvent('perfecto_tablet:server:guardarNPC', GetEntityCoords(ghostPed), GetEntityHeading(ghostPed))
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

-- === NUI CALLBACKS ===

RegisterNUICallback('close', function(data, cb)
    isVisible = false
    SetNuiFocus(false, false)
    StopTabletAnimation()
    cb('ok')
end)

RegisterNUICallback('purchase', function(data, cb)
    TriggerServerEvent('marketplace:purchase', data.items, data.total)
    cb({ success = true })
end)

RegisterNUICallback('marketplace:postAd', function(data, cb)
    TriggerServerEvent('marketplace:server:postAd', data)
    cb('ok')
end)

-- === CARGA INICIAL ===

CreateThread(function()
    Wait(1000)
    ESX.TriggerServerCallback('perfecto_tablet:server:getNPCCoords', function(data)
        if data then SpawnTabletNPC(data) end
    end)
end)

RegisterNetEvent('perfecto_tablet:client:actualizarNPC')
AddEventHandler('perfecto_tablet:client:actualizarNPC', function(data)
    SpawnTabletNPC(data)
end)