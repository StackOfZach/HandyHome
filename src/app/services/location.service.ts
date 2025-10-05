import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GeocodeResult {
  address: string;
  coordinates: LocationCoordinates;
  city?: string;
  country?: string;
  postalCode?: string;
}

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  constructor() {}

  /**
   * Get the user's current location using device GPS
   */
  async getCurrentLocation(): Promise<LocationCoordinates> {
    try {
      // Check if we have permission
      const permissions = await Geolocation.checkPermissions();

      if (permissions.location !== 'granted') {
        // Request permission
        const requestResult = await Geolocation.requestPermissions();
        if (requestResult.location !== 'granted') {
          throw new Error('Location permission denied');
        }
      }

      // Get current position
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }

  /**
   * Watch the user's location for continuous updates
   */
  async watchLocation(
    callback: (location: LocationCoordinates) => void
  ): Promise<string> {
    const watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
      (position, err) => {
        if (err) {
          console.error('Error watching location:', err);
          return;
        }

        if (position) {
          callback({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
        }
      }
    );

    return watchId;
  }

  /**
   * Stop watching location
   */
  clearLocationWatch(watchId: string): void {
    Geolocation.clearWatch({ id: watchId });
  }

  /**
   * Reverse geocoding - convert coordinates to address
   * Using Nominatim (OpenStreetMap) API - free alternative to Google Geocoding
   */
  async reverseGeocode(
    coordinates: LocationCoordinates
  ): Promise<GeocodeResult | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinates.latitude}&lon=${coordinates.longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'HandyHome-App',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }

      const data = await response.json();

      if (data && data.display_name) {
        return {
          address: data.display_name,
          coordinates,
          city:
            data.address?.city || data.address?.town || data.address?.village,
          country: data.address?.country,
          postalCode: data.address?.postcode,
        };
      }

      return null;
    } catch (error) {
      console.error('Error in reverse geocoding:', error);
      return null;
    }
  }

  /**
   * Forward geocoding - convert address to coordinates
   */
  async geocodeAddress(address: string): Promise<GeocodeResult[]> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'HandyHome-App',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }

      const data = await response.json();

      return data.map((item: any) => ({
        address: item.display_name,
        coordinates: {
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        },
        city: item.address?.city || item.address?.town || item.address?.village,
        country: item.address?.country,
        postalCode: item.address?.postcode,
      }));
    } catch (error) {
      console.error('Error in forward geocoding:', error);
      return [];
    }
  }

  /**
   * Calculate distance between two coordinates (in kilometers)
   */
  calculateDistance(
    coord1: LocationCoordinates,
    coord2: LocationCoordinates
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.degreesToRadians(coord2.latitude - coord1.latitude);
    const dLon = this.degreesToRadians(coord2.longitude - coord1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degreesToRadians(coord1.latitude)) *
        Math.cos(this.degreesToRadians(coord2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Check if coordinates are within Philippines bounds (approximate)
   */
  isWithinPhilippines(coordinates: LocationCoordinates): boolean {
    const { latitude, longitude } = coordinates;

    // Approximate bounds of Philippines
    const bounds = {
      north: 21.0,
      south: 4.5,
      east: 127.0,
      west: 116.0,
    };

    return (
      latitude >= bounds.south &&
      latitude <= bounds.north &&
      longitude >= bounds.west &&
      longitude <= bounds.east
    );
  }

  /**
   * Get default Philippines location (Manila)
   */
  getDefaultPhilippinesLocation(): LocationCoordinates {
    return {
      latitude: 14.5995,
      longitude: 120.9842, // Manila coordinates
    };
  }

  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
