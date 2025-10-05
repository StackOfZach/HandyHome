import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
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
  latitude: number;
  longitude: number;
}

export interface MapPin {
  coordinates: MapCoordinates;
  title?: string;
  address?: string;
}

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
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

  @Output() pinPlaced = new EventEmitter<MapPin>();
  @Output() pinRemoved = new EventEmitter<MapPin>();
  @Output() mapReady = new EventEmitter<L.Map>();

  public map: L.Map | null = null;
  private markers: L.Marker[] = [];
  private currentLocationMarker: L.Marker | null = null;
  private selectedLocationMarker: L.Marker | null = null; // Track single selected location

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
    this.map = L.map(this.mapContainer.nativeElement).setView(
      [this.initialCoordinates.latitude, this.initialCoordinates.longitude],
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

    const icon = isCurrentLocation
      ? this.currentLocationIcon
      : this.defaultIcon;
    const marker = L.marker(
      [pin.coordinates.latitude, pin.coordinates.longitude],
      { icon }
    ).addTo(this.map);

    if (pin.title || pin.address) {
      const popupContent = `
        ${pin.title ? `<strong>${pin.title}</strong><br>` : ''}
        ${pin.address ? pin.address : ''}
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
        [coordinates.latitude, coordinates.longitude],
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
              this.map.setView(
                [coordinates.latitude, coordinates.longitude],
                this.zoom
              );
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
      this.map.setView(
        [coordinates.latitude, coordinates.longitude],
        zoom || this.zoom
      );
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
}
