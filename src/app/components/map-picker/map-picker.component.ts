import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
} from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-picker',
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss'],
  standalone: true,
})
export class MapPickerComponent implements OnInit, OnDestroy {
  @Input() initialLocation: { lat: number; lng: number } | null = null;
  @Output() locationSelected = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  private map!: L.Map;
  private marker!: L.Marker;

  // Default location (Manila, Philippines)
  private defaultLocation = { lat: 14.5995, lng: 120.9842 };

  ngOnInit() {
    this.initializeMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  private initializeMap() {
    // Set initial location
    const initialLat = this.initialLocation?.lat || this.defaultLocation.lat;
    const initialLng = this.initialLocation?.lng || this.defaultLocation.lng;

    // Initialize map
    this.map = L.map(this.mapContainer.nativeElement).setView(
      [initialLat, initialLng],
      13
    );

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    // Create custom marker icon
    const customIcon = L.icon({
      iconUrl: '/assets/map-pin.png',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });

    // Add marker at initial location
    this.marker = L.marker([initialLat, initialLng], {
      icon: customIcon,
      draggable: true,
    }).addTo(this.map);

    // Emit initial location
    this.locationSelected.emit({ lat: initialLat, lng: initialLng });

    // Handle marker drag
    this.marker.on('dragend', (e) => {
      const position = e.target.getLatLng();
      this.locationSelected.emit({ lat: position.lat, lng: position.lng });
    });

    // Handle map click
    this.map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      this.marker.setLatLng([lat, lng]);
      this.locationSelected.emit({ lat, lng });
    });

    // Get user's current location
    this.getCurrentLocation();
  }

  private getCurrentLocation() {
    if (navigator.geolocation && !this.initialLocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          // Update map view and marker
          this.map.setView([lat, lng], 15);
          this.marker.setLatLng([lat, lng]);

          // Emit new location
          this.locationSelected.emit({ lat, lng });
        },
        (error) => {
          console.warn('Could not get current location:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    }
  }
}
