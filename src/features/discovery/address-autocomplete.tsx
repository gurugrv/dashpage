'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PlacesEnrichment } from '@/lib/discovery/types';

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
  // Track whether user just selected from dropdown (to prevent Enter from double-submitting)
  const justSelectedRef = useRef(false);

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.place_id) return;

    const address = place.formatted_address ?? place.name ?? '';
    onChange(address);
    justSelectedRef.current = true;

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
        // Fallback: submit as plain text
        onSubmitPlain();
      });
  }, [onChange, onSelect, onSubmitPlain]);

  useEffect(() => {
    if (!GOOGLE_KEY || !inputRef.current) return;

    let cancelled = false;

    import('@googlemaps/js-api-loader').then(({ setOptions, importLibrary }) => {
      if (cancelled || !inputRef.current) return;

      setOptions({ key: GOOGLE_KEY!, v: 'weekly' });

      importLibrary('places').then(() => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['establishment', 'geocode'],
          fields: ['place_id', 'formatted_address', 'name', 'geometry', 'types'],
        });
        autocomplete.addListener('place_changed', handlePlaceChanged);
        autocompleteRef.current = autocomplete;
        setLoaded(true);
      }).catch(() => {
        // Google Maps failed to load - works as plain text input
      });
    }).catch(() => {
      // Loader failed - works as plain text input
    });

    return () => { cancelled = true; };
  }, [handlePlaceChanged]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // If the Places dropdown is open, Enter selects from it (handled by Google).
      // We use a short delay to check if a place was just selected.
      setTimeout(() => {
        if (!justSelectedRef.current) {
          onSubmitPlain();
        }
        justSelectedRef.current = false;
      }, 100);
    }
  };

  const hasAutocomplete = !!GOOGLE_KEY;

  return (
    <div className="flex flex-1 gap-2">
      <div className="relative flex-1">
        {hasAutocomplete && loaded && (
          <MapPin className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="123 Main St, City, State"
          className={`h-9 text-sm ${hasAutocomplete && loaded ? 'pl-8' : ''}`}
        />
      </div>
      <Button size="sm" className="h-9" onClick={onSubmitPlain} disabled={!value.trim()}>
        Submit
      </Button>
    </div>
  );
}
