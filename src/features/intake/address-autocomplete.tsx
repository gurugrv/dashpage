'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PlacesEnrichment } from '@/lib/intake/types';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: string, enrichment: PlacesEnrichment) => void;
  onSubmitPlain: () => void;
}

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmitPlain,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.place_id) return;

    const address = place.formatted_address ?? place.name ?? '';
    onChange(address);

    // Fetch enrichment from our server-side API
    fetch('/api/places/details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId: place.place_id }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((details) => {
        const enrichment: PlacesEnrichment = details
          ? {
              formattedAddress: details.formattedAddress,
              lat: details.location.latitude,
              lng: details.location.longitude,
              types: details.types,
              primaryType: details.primaryType,
              displayName: details.displayName,
              googleMapsUri: details.googleMapsUri,
            }
          : {
              formattedAddress: address,
              lat: place.geometry?.location?.lat() ?? 0,
              lng: place.geometry?.location?.lng() ?? 0,
              types: place.types ?? [],
              primaryType: place.types?.[0] ?? '',
              displayName: place.name ?? '',
              googleMapsUri: '',
            };
        onSelect(address, enrichment);
      })
      .catch(() => {
        // Fallback: submit without enrichment
        onSelect(address, {
          formattedAddress: address,
          lat: place.geometry?.location?.lat() ?? 0,
          lng: place.geometry?.location?.lng() ?? 0,
          types: place.types ?? [],
          primaryType: place.types?.[0] ?? '',
          displayName: place.name ?? '',
          googleMapsUri: '',
        });
      });
  }, [onChange, onSelect]);

  useEffect(() => {
    if (!GOOGLE_KEY || !inputRef.current) return;

    setOptions({ key: GOOGLE_KEY, v: 'weekly' });

    importLibrary('places').then(() => {
      if (!inputRef.current) return;
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        types: ['establishment', 'geocode'],
        fields: ['place_id', 'formatted_address', 'name', 'geometry', 'types'],
      });
      autocomplete.addListener('place_changed', handlePlaceChanged);
      autocompleteRef.current = autocomplete;
      setLoaded(true);
    }).catch(() => {
      // Google Maps failed to load - will work as plain text
    });
  }, [handlePlaceChanged]);

  // Fallback: no Google key, plain text input
  if (!GOOGLE_KEY) {
    return (
      <div className="flex flex-1 gap-2">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmitPlain();
            }
          }}
          placeholder="123 Main St, City, State"
          className="h-9 flex-1 text-sm"
        />
        <Button size="sm" className="h-9" onClick={onSubmitPlain} disabled={!value.trim()}>
          Submit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 gap-2">
      <div className="relative flex-1">
        <MapPin className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={loaded ? 'Start typing an address...' : 'Loading...'}
          className="h-9 pl-8 text-sm"
        />
      </div>
      <Button size="sm" className="h-9" onClick={onSubmitPlain} disabled={!value.trim()}>
        Submit
      </Button>
    </div>
  );
}
