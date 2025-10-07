import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

export interface MapCoordinates {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
}

export interface MapPin {
  coordinates?: MapCoordinates;
  position?: MapCoordinates;
  title?: string;
  address?: string;
  label?: string;
  color?: string;
}

export interface TracePath {
  coordinates: MapCoordinates[];
  color?: string;
  weight?: number;
  opacity?: number;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class MapComponent
  implements OnInit, AfterViewInit, OnDestroy, OnChanges
{
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  @Input() height: string = '300px';
  @Input() initialCoordinates: MapCoordinates = {
    latitude: 14.5995,
    longitude: 120.9842,
  }; // Manila, Philippines
  @Input() zoom: number = 13;
  @Input() pins: MapPin[] = [];
  @Input() allowPinPlacement: boolean = true;
  @Input() showCurrentLocation: boolean = true;
  @Input() tracePath: MapCoordinates[] = [];
  @Input() coordinates: MapCoordinates = {
    latitude: 14.5995,
    longitude: 120.9842,
  };

  @Output() pinPlaced = new EventEmitter<MapPin>();
  @Output() pinRemoved = new EventEmitter<MapPin>();
  @Output() mapReady = new EventEmitter<L.Map>();
  @Output() coordinatesChange = new EventEmitter<MapCoordinates>();

  public map: L.Map | null = null;
  private markers: L.Marker[] = [];
  private currentLocationMarker: L.Marker | null = null;
  private selectedLocationMarker: L.Marker | null = null; // Track single selected location
  private polylines: L.Polyline[] = [];
  private trackingMarkers: L.Marker[] = [];

  // Custom icon configurations
  private defaultIcon = L.icon({
    iconUrl: 'assets/map-pin.png',
    iconSize: [32, 32], // Fixed square size for better visibility
    iconAnchor: [16, 32], // Center bottom of icon
    popupAnchor: [0, -32], // Popup appears above the icon
  });

  private currentLocationIcon = L.icon({
    iconUrl: 'assets/current-loc.png',
    iconSize: [28, 28], // Slightly smaller for current location
    iconAnchor: [14, 14], // Center of icon
    popupAnchor: [0, -14], // Popup appears above the icon
  });

  constructor() {}

  ngOnInit() {}

  /**
   * Convert coordinates to standard lat/lng format
   */
  private normalizeCoordinates(coords: MapCoordinates): {
    lat: number;
    lng: number;
  } {
    const lat = coords.latitude ?? coords.lat ?? 14.5995;
    const lng = coords.longitude ?? coords.lng ?? 120.9842;
    return { lat, lng };
  }

  /**
   * Convert coordinates to Leaflet's expected format [lat, lng]
   */
  private toLeafletCoords(coords: MapCoordinates): [number, number] {
    const normalized = this.normalizeCoordinates(coords);
    return [normalized.lat, normalized.lng];
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  ngOnDestroy() {
    // Clean up markers
    this.clearPins();
    if (this.currentLocationMarker) {
      this.currentLocationMarker = null;
    }

    if (this.map) {
      this.map.remove();
    }
  }

  private initializeMap() {
    // Fix for default markers in Leaflet with Angular
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    // Initialize the map
    const centerCoords =
      this.coordinates.lat && this.coordinates.lng
        ? this.coordinates
        : this.initialCoordinates;

    this.map = L.map(this.mapContainer.nativeElement).setView(
      this.toLeafletCoords(centerCoords),
      this.zoom
    );

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    // Add existing pins
    this.addExistingPins();

    // Add click handler for pin placement
    if (this.allowPinPlacement) {
      this.map.on('click', (e) => this.onMapClick(e));
    }

    // Show current location if enabled
    if (this.showCurrentLocation) {
      this.getCurrentLocation();
    }

    // Emit map ready event
    this.mapReady.emit(this.map);
  }

  private addExistingPins() {
    this.pins.forEach((pin) => this.addPin(pin));
  }

  private addPin(pin: MapPin, isCurrentLocation: boolean = false) {
    if (!this.map) return;

    const coords = pin.coordinates || pin.position;
    if (!coords) return;

    const icon = isCurrentLocation
      ? this.currentLocationIcon
      : this.defaultIcon;
    const marker = L.marker(this.toLeafletCoords(coords), { icon }).addTo(
      this.map
    );

    const title = pin.title || pin.label || '';
    const address = pin.address || '';

    if (title || address) {
      const popupContent = `
        ${title ? `<strong>${title}</strong><br>` : ''}
        ${address ? address : ''}
      `;
      marker.bindPopup(popupContent);
    }

    if (isCurrentLocation) {
      this.currentLocationMarker = marker;
    } else {
      this.markers.push(marker);
    }
  }

  private onMapClick(e: L.LeafletMouseEvent) {
    // Remove previous selected location marker if it exists
    if (this.selectedLocationMarker) {
      this.map?.removeLayer(this.selectedLocationMarker);
      this.selectedLocationMarker = null;
    }

    const coordinates: MapCoordinates = {
      latitude: e.latlng.lat,
      longitude: e.latlng.lng,
    };

    const pin: MapPin = {
      coordinates,
      title: 'Selected Location',
    };

    // Add new selected location marker
    if (this.map) {
      this.selectedLocationMarker = L.marker(
        this.toLeafletCoords(coordinates),
        {
          icon: this.defaultIcon,
        }
      ).addTo(this.map);

      // Add popup
      this.selectedLocationMarker.bindPopup(
        '<strong>Selected Location</strong><br>Tap elsewhere to move pin'
      );
    }

    // Emit pin placed event
    this.pinPlaced.emit(pin);
  }

  private async getCurrentLocation() {
    try {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coordinates: MapCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };

            const pin: MapPin = {
              coordinates,
              title: 'Your Location',
            };

            this.addPin(pin, true);

            // Center map on current location
            if (this.map) {
              this.map.setView(this.toLeafletCoords(coordinates), this.zoom);
            }
          },
          (error) => {
            console.warn('Error getting current location:', error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
          }
        );
      }
    } catch (error) {
      console.warn('Geolocation not available:', error);
    }
  }

  // Public methods
  public clearPins() {
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];

    // Also clear selected location marker
    if (this.selectedLocationMarker) {
      this.map?.removeLayer(this.selectedLocationMarker);
      this.selectedLocationMarker = null;
    }
  }

  public addPinAt(
    coordinates: MapCoordinates,
    title?: string,
    address?: string
  ) {
    const pin: MapPin = { coordinates, title, address };
    this.addPin(pin);
    return pin;
  }

  public centerMap(coordinates: MapCoordinates, zoom?: number) {
    if (this.map) {
      this.map.setView(this.toLeafletCoords(coordinates), zoom || this.zoom);
    }
  }

  public clearSelectedLocation() {
    if (this.selectedLocationMarker) {
      this.map?.removeLayer(this.selectedLocationMarker);
      this.selectedLocationMarker = null;
    }
  }

  public getMapInstance(): L.Map | null {
    return this.map;
  }

  /**
   * Add trace path (polyline) between coordinates
   */
  public addTracePath(
    coordinates: MapCoordinates[],
    options?: {
      color?: string;
      weight?: number;
      opacity?: number;
    }
  ) {
    if (!this.map || coordinates.length < 2) return;

    // Convert coordinates to Leaflet format
    const leafletCoords: [number, number][] = coordinates.map((coord) =>
      this.toLeafletCoords(coord)
    );

    const polyline = L.polyline(leafletCoords, {
      color: options?.color || '#3388ff',
      weight: options?.weight || 5,
      opacity: options?.opacity || 0.7,
      smoothFactor: 1,
    }).addTo(this.map);

    this.polylines.push(polyline);

    // Add arrow markers along the path
    this.addPathArrows(leafletCoords);
  }

  /**
   * Add directional arrows along the path
   */
  private addPathArrows(coordinates: [number, number][]) {
    if (!this.map || coordinates.length < 2) return;

    // Add arrow at the midpoint
    const midIndex = Math.floor(coordinates.length / 2);
    if (midIndex < coordinates.length - 1) {
      const start = coordinates[midIndex];
      const end = coordinates[midIndex + 1];

      // Calculate angle for arrow rotation
      const angle =
        (Math.atan2(end[0] - start[0], end[1] - start[1]) * 180) / Math.PI;

      const arrowIcon = L.divIcon({
        html: `<div style="transform: rotate(${angle}deg); color: #3388ff; font-size: 16px;">▲</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const arrowMarker = L.marker(
        [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        { icon: arrowIcon }
      ).addTo(this.map);

      this.trackingMarkers.push(arrowMarker);
    }
  }

  /**
   * Clear all trace paths
   */
  public clearTracePaths() {
    this.polylines.forEach((polyline) => {
      if (this.map) {
        this.map.removeLayer(polyline);
      }
    });
    this.polylines = [];

    // Clear arrow markers
    this.trackingMarkers.forEach((marker) => {
      if (this.map) {
        this.map.removeLayer(marker);
      }
    });
    this.trackingMarkers = [];
  }

  /**
   * Update pins with new data (for real-time tracking)
   */
  public updatePins(pins: MapPin[]) {
    this.clearPins();
    this.pins = pins;
    this.addExistingPins();

    // Update trace path if provided
    if (this.tracePath && this.tracePath.length > 0) {
      this.clearTracePaths();
      this.addTracePath(this.tracePath);
    }

    // Auto-fit map to show all pins
    this.fitMapToPins();
  }

  /**
   * Fit map to show all current pins
   */
  public fitMapToPins() {
    if (!this.map || this.pins.length === 0) return;

    const coords: [number, number][] = [];

    this.pins.forEach((pin) => {
      const pinCoords = pin.coordinates || pin.position;
      if (pinCoords) {
        coords.push(this.toLeafletCoords(pinCoords));
      }
    });

    if (coords.length > 0) {
      const group = L.featureGroup(coords.map((coord) => L.marker(coord)));
      this.map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  /**
   * Add custom marker with color
   */
  public addColoredPin(
    coordinates: MapCoordinates,
    options: {
      title?: string;
      color?: string;
      label?: string;
    }
  ) {
    if (!this.map) return;

    const color = options.color || 'blue';
    const colorIcon = this.createColoredIcon(color);

    const marker = L.marker(this.toLeafletCoords(coordinates), {
      icon: colorIcon,
    }).addTo(this.map);

    if (options.title || options.label) {
      const popupContent = `<strong>${options.title || options.label}</strong>`;
      marker.bindPopup(popupContent);
    }

    this.trackingMarkers.push(marker);
    return marker;
  }

  /**
   * Create colored icon for different pin types
   */
  private createColoredIcon(color: string): L.DivIcon {
    const colorMap: { [key: string]: string } = {
      primary: '#3880ff',
      success: '#2dd36f',
      warning: '#ffc409',
      danger: '#eb445a',
      blue: '#3880ff',
      green: '#2dd36f',
      red: '#eb445a',
      orange: '#ff6600',
    };

    const hexColor = colorMap[color] || color;

    return L.divIcon({
      html: `<div style="
        background-color: ${hexColor};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15],
    });
  }

  /**
   * Handle input changes for real-time updates
   */
  ngOnChanges() {
    if (this.map) {
      // Update center if coordinates changed
      if (this.coordinates.lat && this.coordinates.lng) {
        this.centerMap(this.coordinates);
      }

      // Update pins
      if (this.pins.length > 0) {
        this.updatePins(this.pins);
      }

      // Update trace path
      if (this.tracePath.length > 0) {
        this.clearTracePaths();
        this.addTracePath(this.tracePath);
      }
    }
  }
}
