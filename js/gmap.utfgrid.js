
// Here goes nothing:
function UtfGrid(url, options) {
  var self = this; 

  this.options = {
    subdomains: 'abc',
    minZoom: 0,
    maxZoom: 18,
    tileSize: 256,
    resolution: 4,
    useJsonP: true,
    pointerCursor: true
  };

  //The thing the mouse is currently on
  this._mouseOn = null;
  this._url = url;
  this._cache = {};

  //Find a unique id in window we can use for our callbacks
  //Required for jsonP
  var i = 0;
  while (window['lu' + i]) {
    i++;
  }
  this._windowKey = 'lu' + i;
  window[this._windowKey] = {};

  var subdomains = this.options.subdomains;
  if (typeof this.options.subdomains === 'string') {
    this.options.subdomains = subdomains.split('');
  }


  this.draw = function () {
    // placeholder required by google
  };

  var handles = [];  
  this.on = function(event, handler, target) {
      var handle = google.maps.event.addListener(target ? target : map, event, handler);
      handles.push(handle);
  };
  this.off = function() {
      while (handles.length) {
          google.maps.event.removeListener(handles.pop());
      }
  };

  this.onAdd = function () {
    var map = this.getMap();

    this._map = map;
    this._container = map.getDiv();

    this._update();

    var zoom = this._map.getZoom();

    if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
      return;
    }

    map.addListener('mousemove', this._move, self);
    map.addListener('idle', this._update, self);
    map.addListener('click', this._click, self);

  };

  this.onRemove = function () {
    var map = this._map;
    map.clearListeners();

    if (this.options.pointerCursor) {
      this._container.style.cursor = '';
    }
  };

  this._click = function (e) {
    google.maps.event.trigger(self, 'click', self._objectForEvent(e));
  };
  
  this._move = function (e) {

    var on = self._objectForEvent(e);

    if (on.data !== this._mouseOn) {
      if (this._mouseOn) {
        google.maps.event.trigger(self, 'mouseout', { latLng: e.latLng, data: this._mouseOn });
        self._container.style.cursor = '';

      }
      if (on.data) {
        // Should really be setting/triggering events on 'on' 
        // but google events aren't that smart and so using 'self'
        // and binding 'on' to that event
        google.maps.event.trigger(self, 'mouseover', on);
        self._container.style.cursor = 'pointer';
      }

      this._mouseOn = on.data;
    } else if (on.data) {
      google.maps.event.trigger(self, 'mouseover', on);
    }
  };

  this._objectForEvent = function (e) {
    var map = this._map,
        tileSize = this.options.tileSize,
        resolution = this.options.resolution;

    var pixelPoint = this._getPixelCoordinates(e.latLng);

    // Get x/y of tile for key
    var tileX = Math.floor(pixelPoint.x / tileSize),
        tileY = Math.floor(pixelPoint.y / tileSize);

    // Get x/y of grid
    var gridX = Math.floor((pixelPoint.x - (tileX * tileSize)) / resolution),
        gridY = Math.floor((pixelPoint.y - (tileY * tileSize)) / resolution);

    var grid_tile = this._cache[map.getZoom() + '_' + tileX + '_' + tileY];

    if (!grid_tile || !grid_tile.grid) {
      return { latLng: e.latLng, data: null };
    }

    var idx = this._utfDecode(grid_tile.grid[gridY].charCodeAt(gridX)),
        key = grid_tile.keys[idx],
        result = grid_tile.data[key];

    if (!grid_tile.data.hasOwnProperty(key)) {
      result = null;
    }

    return { latLng: e.latLng, data: result};
  };

  //Load up all required json grid files
  //TODO: Load from center etc - ?
  this._update = function () {
    var zoom = self._map.getZoom(),
        tileSize = self.options.tileSize;

    if (zoom > self.options.maxZoom || zoom < self.options.minZoom) {
      return;
    }

    var mapBounds = self._map.getBounds(),
        mB_NE = mapBounds.getNorthEast(),
        mB_SW = mapBounds.getSouthWest();

    // Get tile coordinates
    var nwTilePoint = self._getTileCoordinates(mB_NE);
    var seTilePoint = self._getTileCoordinates(mB_SW);

    //Load all required ones
    for (var x = seTilePoint.x; x <= nwTilePoint.x; x++) {
      for (var y = nwTilePoint.y; y <= seTilePoint.y; y++) {

        var key = zoom + '_' + x + '_' + y;

        if (!self._cache.hasOwnProperty(key)) {
          self._cache[key] = null;

          if (self.options.useJsonP) {
            self._loadTileP(zoom, x, y);
          } else {
            // TODO: refactor _loadTile
            //self._loadTile(zoom, x, y);
          }
        }
      }
    }
  };

  this._getPixelCoordinates = function(coord) { 
    var numTiles = 1 << this._map.getZoom();
    var projection = this._map.getProjection();
    var tilesize = this.options.tileSize;

    var worldCoordinate = projection.fromLatLngToPoint(coord);
    var pixelCoordinate = new google.maps.Point(
        worldCoordinate.x * numTiles,
        worldCoordinate.y * numTiles);

    return pixelCoordinate;
  };
  this._getTileCoordinates = function(coord) { 
    var tilesize = this.options.tileSize;
    var pixelCoord = this._getPixelCoordinates(coord);

    var tileCoordinate = new google.maps.Point(
        Math.floor(pixelCoord.x / tilesize),
        Math.floor(pixelCoord.y / tilesize));

    return tileCoordinate;
  };

  this._loadTileP = function (zoom, x, y) {

    var head = document.getElementsByTagName('head')[0],
        key = zoom + '_' + x + '_' + y,
        functionName = 'lu_' + key,
        wk = this._windowKey,
        self = this;

    var url = this._url.replace('{z}', Math.floor(zoom))
                       .replace('{x}', this.normalizeCoordinate(x, zoom))
                       .replace('{y}', this.normalizeCoordinate(y, zoom))
                       .replace('{cb}', wk + '.' + functionName);

    var script = document.createElement('script');
    script.setAttribute("type", "text/javascript");
    script.setAttribute("src", url);

    window[wk][functionName] = function (data) {
      self._cache[key] = data;
      delete window[wk][functionName];
      head.removeChild(script);
    };

    head.appendChild(script);
  };

  this._utfDecode = function (c) {
    if (c >= 93) {
      c--;
    }
    if (c >= 35) {
      c--;
    }
    return c - 32;
  };

  this.normalizeCoordinate = function (coord, zoom) {
    // tiles are on a 4^zoom tile grid
    var maxTiles = Math.sqrt(Math.pow(4, zoom));

    if (zoom > 0)
    {
      while (coord > maxTiles || coord < 0)
      {
        if (coord > maxTiles)
        {
          coord -= maxTiles;
        }
        else if (coord < 0)
        {
          coord += maxTiles;
        }
      }
    }

    return coord;
  };


}

UtfGrid.prototype = new google.maps.OverlayView();