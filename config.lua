-- ================================================================
--  NEXUS MARKET — config.lua  v3.0
--  Compartida entre client.lua y server.lua
-- ================================================================

Config = {}

-- Items comprables directamente (config legacy, preservada)
Config.Items = {
    { label = "Pan",    item = "bread",  price = 50   },
    { label = "Agua",   item = "water",  price = 30   },
    { label = "Tablet", item = "tablet", price = 1000 },
}

-- Comisión por crear una publicación ($0 = gratis)
Config.ListingCommission = 0

-- ──────────────────────────────────────────────────────────────
-- COORDENADAS DEL HANGAR
-- Podés cambiarlas o usar /setHangar en el juego para reposicionarlas
-- ──────────────────────────────────────────────────────────────

-- NPC receptor del hangar (donde se entregan items y vehículos)
-- vector4(x, y, z, heading)
Config.HangarNPC = vector4(-1336.5, -1279.8, 4.3, 178.0)

-- Armario de retiros (mismo NPC, misma zona)
Config.HangarLocker = vector3(-1338.0, -1285.0, 4.3)

-- Slots para vehículos en exposición (freezeados en el lote del hangar)
-- Ajustá las coordenadas según tu mapa
Config.VehicleSlots = {
    vector4(-1326.0, -1280.0, 4.3, 90.0),
    vector4(-1326.0, -1284.5, 4.3, 90.0),
    vector4(-1326.0, -1289.0, 4.3, 90.0),
    vector4(-1326.0, -1293.5, 4.3, 90.0),
    vector4(-1326.0, -1298.0, 4.3, 90.0),
    vector4(-1326.0, -1302.5, 4.3, 90.0),
    vector4(-1326.0, -1307.0, 4.3, 90.0),
    vector4(-1326.0, -1311.5, 4.3, 90.0),
}

-- ──────────────────────────────────────────────────────────────
-- SEED LISTINGS (publicaciones genéricas siempre presentes)
-- Se insertan en la DB al iniciar si no existen.
-- El precio/qty es FIJO — no cambia al reiniciar.
-- ──────────────────────────────────────────────────────────────
Config.SeedListings = {
    { item = 'weapon_assaultrifle', label = 'Assault Rifle MK2',  price = 43500, qty = 1,  category = 'weapons',     condition = 'Factory New', isVehicle = false },
    { item = 'weapon_pistol',       label = 'Combat Pistol',       price = 4200,  qty = 3,  category = 'weapons',     condition = 'Slight Wear', isVehicle = false },
    { item = 'weapon_smg',          label = 'Micro SMG',           price = 7800,  qty = 2,  category = 'weapons',     condition = 'Used',        isVehicle = false },
    { item = 'turbo',               label = 'Turbocharger Kit',    price = 11500, qty = 2,  category = 'tools',       condition = 'New',         isVehicle = false },
    { item = 'repairkit',           label = 'Vehicle Repair Kit',  price = 750,   qty = 8,  category = 'tools',       condition = 'New',         isVehicle = false },
    { item = 'medikit',             label = 'First Aid Kit',       price = 480,   qty = 5,  category = 'consumables', condition = 'New',         isVehicle = false },
    { item = 'bandage',             label = 'Bandage Roll x5',     price = 95,    qty = 12, category = 'consumables', condition = 'New',         isVehicle = false },
    { item = 'armor',               label = 'Heavy Body Armor',    price = 2200,  qty = 1,  category = 'weapons',     condition = 'Damaged',     isVehicle = false },
    { item = 'lockpick',            label = 'Advanced Lockpick',   price = 1900,  qty = 4,  category = 'tools',       condition = 'Slight Wear', isVehicle = false },
    { item = 'water',               label = 'Water Bottle',        price = 75,    qty = 20, category = 'consumables', condition = 'New',         isVehicle = false },
    { item = 'sandwich',            label = 'Deli Sandwich',       price = 110,   qty = 10, category = 'consumables', condition = 'New',         isVehicle = false },
    -- Vehículos de exposición permanentes (spawneados en el lote)
    { item = 'adder',    label = 'Truffade Adder',   price = 118000, qty = 1, category = 'vehicles', condition = 'Pristine',    isVehicle = true, vehicleModel = 'adder',   vehicleSlot = 1 },
    { item = 'zentorno', label = 'Pegassi Zentorno', price = 82000,  qty = 1, category = 'vehicles', condition = 'Factory New', isVehicle = true, vehicleModel = 'zentorno',vehicleSlot = 2 },
    { item = 'elegy2',   label = 'Annis Elegy RH8',  price = 33500,  qty = 1, category = 'vehicles', condition = 'Slight Wear', isVehicle = true, vehicleModel = 'elegy2',  vehicleSlot = 3 },
}
