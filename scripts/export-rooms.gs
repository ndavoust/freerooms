/**
 * Export Workspace room calendars to rooms.json on the admin's Drive.
 *
 * Setup:
 * 1. Open https://script.google.com as a Workspace admin.
 * 2. Create a project and paste this file.
 * 3. Add the advanced service "Admin SDK API" and keep the identifier AdminDirectory.
 * 4. Run exportRooms and authorize the admin scopes.
 *
 * A building with one floor becomes a single location ("Paris").
 * A building with several floors becomes one location per floor ("Nantes 1er étage").
 * Labels in the JSON can be edited before the file is copied to public/rooms.json.
 */

function exportRooms() {
  if (typeof AdminDirectory === 'undefined') {
    throw new Error(
      'Enable the Admin SDK API advanced service and keep its identifier as AdminDirectory.',
    )
  }

  var buildings = listBuildings_()
  var resources = selectResources_(listResourceCalendars_())
  var config = buildRoomsConfig_(buildings, resources)
  var json = JSON.stringify(config, null, 2)
  var file = writeRoomsFile_(json)

  Logger.log(json)
  Logger.log(config.rooms.length + ' rooms, ' + config.locations.length + ' locations')
  Logger.log(file.getUrl())
}

function listBuildings_() {
  return listPages_(function (pageToken) {
    var options = { maxResults: 100 }
    if (pageToken) options.pageToken = pageToken
    return AdminDirectory.Resources.Buildings.list('my_customer', options)
  })
}

function listResourceCalendars_() {
  return listPages_(function (pageToken) {
    var options = { maxResults: 100 }
    if (pageToken) options.pageToken = pageToken
    return AdminDirectory.Resources.Calendars.list('my_customer', options)
  })
}

function listPages_(fetchPage) {
  var items = []
  var pageToken
  do {
    var page = fetchPage(pageToken) || {}
    var batch = page.items || page.buildings || page.calendarResources || []
    for (var index = 0; index < batch.length; index += 1) items.push(batch[index])
    pageToken = page.nextPageToken
  } while (pageToken)
  return items
}

function selectResources_(resources) {
  var withEmail = resources.filter(function (resource) {
    return resource && resource.resourceEmail
  })
  var rooms = withEmail.filter(function (resource) {
    return !resource.resourceCategory || resource.resourceCategory === 'CONFERENCE_ROOM'
  })
  if (rooms.length > 0) return rooms
  Logger.log('No CONFERENCE_ROOM resources. Exporting every resource calendar instead.')
  return withEmail
}

function buildRoomsConfig_(buildings, resources) {
  var buildingNames = {}
  buildings.forEach(function (building) {
    if (building.buildingId) {
      buildingNames[building.buildingId] = building.buildingName || building.buildingId
    }
  })

  var drafts = resources.map(function (resource) {
    var capacity = Number(resource.capacity)
    return {
      name: resource.resourceName || resource.resourceEmail,
      calendarId: resource.resourceEmail,
      buildingId: resource.buildingId || '',
      floorName: String(resource.floorName || '').trim(),
      capacity: capacity,
    }
  })

  var floorsByBuilding = {}
  drafts.forEach(function (room) {
    if (!floorsByBuilding[room.buildingId]) floorsByBuilding[room.buildingId] = {}
    floorsByBuilding[room.buildingId][room.floorName] = true
  })

  var usedIds = {}
  var locationByKey = {}
  var locations = []

  function locationFor(room) {
    var floorCount = Object.keys(floorsByBuilding[room.buildingId] || {}).length
    var multiple = floorCount > 1
    var buildingName = buildingNames[room.buildingId] || room.buildingId || 'Autre'
    var floorLabel = formatFloor_(room.floorName)
    var label = multiple && floorLabel ? buildingName + ' ' + floorLabel : buildingName
    var key = room.buildingId + '|' + (multiple ? room.floorName : '')
    if (!locationByKey[key]) {
      var id = uniqueSlug_(slug_(label), usedIds)
      locationByKey[key] = id
      locations.push({ id: id, label: label })
    }
    return locationByKey[key]
  }

  var rooms = drafts.map(function (room) {
    var entry = {
      name: room.name,
      calendarId: room.calendarId,
      locationId: locationFor(room),
    }
    if (isFinite(room.capacity) && room.capacity > 0) entry.capacity = room.capacity
    return entry
  })

  rooms.sort(function (a, b) {
    return a.name.localeCompare(b.name, 'fr')
  })
  locations.sort(function (a, b) {
    return a.label.localeCompare(b.label, 'fr')
  })

  return {
    generatedAt: new Date().toISOString(),
    locations: locations,
    rooms: rooms,
  }
}

function formatFloor_(floorName) {
  var raw = String(floorName || '').trim()
  if (!raw) return ''
  var lower = raw.toLowerCase()
  if (
    lower === 'rdc' ||
    lower === '0' ||
    lower === 'rez-de-chaussée' ||
    lower === 'rez-de-chaussee' ||
    lower === 'rez de chaussée' ||
    lower === 'rez de chaussee'
  ) {
    return 'rez-de-chaussée'
  }
  if (/^\d+$/.test(raw)) {
    var level = Number(raw)
    if (level === 0) return 'rez-de-chaussée'
    if (level === 1) return '1er étage'
    return level + 'e étage'
  }
  return raw
}

function slug_(label) {
  var slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'lieu'
}

function uniqueSlug_(base, used) {
  var id = base
  var suffix = 2
  while (used[id]) {
    id = base + '-' + suffix
    suffix += 1
  }
  used[id] = true
  return id
}

function writeRoomsFile_(json) {
  var name = 'rooms.json'
  var existing = DriveApp.getFilesByName(name)
  if (existing.hasNext()) {
    var file = existing.next()
    file.setContent(json)
    return file
  }
  return DriveApp.createFile(name, json, 'application/json')
}
