/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Mail, 
  ChevronDown, 
  ArrowRight, 
  Hourglass,
  Gauge,
  Loader2
} from 'lucide-react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

// Initialize Google Maps API options globally
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'undefined' && GOOGLE_MAPS_API_KEY.length > 0) {
  setOptions({
    apiKey: GOOGLE_MAPS_API_KEY,
    key: GOOGLE_MAPS_API_KEY, // Some versions use 'key' instead of 'apiKey'
    version: "weekly",
    libraries: ["places", "routes"]
  } as any);
}

type TripType = 'one-way' | 'hourly';
type LocationType = 'location' | 'airport';

interface FormData {
  tripType: TripType;
  pickupDate: string;
  pickupTime: string;
  pickupLocationType: LocationType;
  pickupLocation: string;
  dropoffLocationType: LocationType;
  dropoffLocation: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  passengers: string;
}

interface TravelInfo {
  distance: string;
  duration: string;
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTime() {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

export default function App() {
  const todayDate = getTodayDate();

  const [formData, setFormData] = useState<FormData>({
    tripType: 'one-way',
    pickupDate: getTodayDate(),
    pickupTime: getCurrentTime(),
    pickupLocationType: 'location',
    pickupLocation: '',
    dropoffLocationType: 'location',
    dropoffLocation: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    passengers: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isRecognized, setIsRecognized] = useState(false);
  const [travelInfo, setTravelInfo] = useState<TravelInfo | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);
  const autocompletePickup = useRef<google.maps.places.Autocomplete | null>(null);
  const autocompleteDropoff = useRef<google.maps.places.Autocomplete | null>(null);

  // Initialize Google Maps Autocomplete
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'undefined' || GOOGLE_MAPS_API_KEY.length === 0) return;

    const initAutocomplete = async () => {
      try {
        // Re-ensure options are set before importing
        setOptions({
          apiKey: GOOGLE_MAPS_API_KEY,
          key: GOOGLE_MAPS_API_KEY,
          version: "weekly",
        } as any);

        const { Autocomplete } = await importLibrary('places') as google.maps.PlacesLibrary;

        if (pickupInputRef.current) {
          autocompletePickup.current = new Autocomplete(pickupInputRef.current, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode", "establishment"]
          });

          autocompletePickup.current.addListener("place_changed", () => {
            const place = autocompletePickup.current?.getPlace();
            if (place?.formatted_address) {
              setFormData(prev => ({ ...prev, pickupLocation: place.formatted_address! }));
            }
          });
        }

        if (dropoffInputRef.current) {
          autocompleteDropoff.current = new Autocomplete(dropoffInputRef.current, {
            fields: ["formatted_address", "geometry", "name"],
            types: ["geocode", "establishment"]
          });

          autocompleteDropoff.current.addListener("place_changed", () => {
            const place = autocompleteDropoff.current?.getPlace();
            if (place?.formatted_address) {
              setFormData(prev => ({ ...prev, dropoffLocation: place.formatted_address! }));
            }
          });
        }
      } catch (error) {
        console.error("Error initializing Autocomplete:", error);
      }
    };

    initAutocomplete();
  }, []);

  // Google Maps Distance Matrix
  const calculateDistance = useCallback(async () => {
    if (!formData.pickupLocation || !formData.dropoffLocation) return;
    
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'undefined' || GOOGLE_MAPS_API_KEY.length === 0) {
      console.warn("Google Maps API Key missing or invalid. Distance calculation skipped.");
      return;
    }

    setIsCalculating(true);
    try {
      // Re-ensure options are set before importing
      setOptions({
        apiKey: GOOGLE_MAPS_API_KEY,
        key: GOOGLE_MAPS_API_KEY,
        version: "weekly",
      } as any);

      const { DistanceMatrixService } = await importLibrary('routes') as google.maps.RoutesLibrary;
      const service = new DistanceMatrixService();

      service.getDistanceMatrix(
        {
          origins: [formData.pickupLocation],
          destinations: [formData.dropoffLocation],
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (response, status) => {
          if (status === "OK" && response) {
            const element = response.rows[0].elements[0];
            if (element.status === "OK") {
              setTravelInfo({
                distance: element.distance.text,
                duration: element.duration.text,
              });
            }
          }
          setIsCalculating(false);
        }
      );
    } catch (error) {
      console.error("Error calculating distance:", error);
      setIsCalculating(false);
    }
  }, [formData.pickupLocation, formData.dropoffLocation]);

  // Check phone number on blur or change
  const checkPhoneNumber = async (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return;
    
    try {
      const response = await fetch(`/api/users/${digits}`);
      if (response.ok) {
        const user = await response.json();
        setFormData(prev => ({
          ...prev,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email
        }));
        setIsRecognized(true);
      } else {
        setIsRecognized(false);
      }
    } catch (error) {
      console.error("Error checking phone number:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateDistance();
    }, 1000);
    return () => clearTimeout(timer);
  }, [calculateDistance]);

  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    // Strip leading '1' country code for formatting
    const local = digits.startsWith('1') ? digits.slice(1) : digits;
    if (local.length === 0) return '';
    if (local.length <= 3) return `+1 ${local}`;
    if (local.length <= 6) return `+1 ${local.slice(0, 3)} ${local.slice(3)}`;
    return `+1 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 10)}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'phoneNumber') {
      const formatted = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, phoneNumber: formatted }));
      checkPhoneNumber(formatted);
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validate = () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    if (!formData.phoneNumber) {
      newErrors.phoneNumber = 'Phone number is required';
    } else if (!/^\+1 \d{3} \d{3} \d{4}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Enter a valid US phone number';
    }
    if (!formData.passengers) newErrors.passengers = 'Passenger count is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            phoneNumber: formData.phoneNumber.replace(/\D/g, ''),
            distance: travelInfo?.distance,
            duration: travelInfo?.duration
          }),
        });

        if (response.ok) {
          const result = await response.json();
          alert(`Booking successful! ID: ${result.bookingId}`);
          setFormData(prev => ({
            tripType: 'one-way',
            pickupDate: prev.pickupDate,
            pickupTime: prev.pickupTime,
            pickupLocationType: 'location',
            pickupLocation: '',
            dropoffLocationType: 'location',
            dropoffLocation: '',
            phoneNumber: '',
            firstName: '',
            lastName: '',
            email: '',
            passengers: '',
          }));
          setIsRecognized(false);
          setTravelInfo(null);
          setErrors({});
        } else {
          alert('Failed to submit booking.');
        }
      } catch (error) {
        console.error("Submission error:", error);
        alert('An error occurred during submission.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        {/* Header Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 text-[#5D5C91] font-bold text-2xl">
            <Gauge className="w-8 h-8" />
            <span>ExampleIQ</span>
          </div>
        </div>

        <h1 className="text-2xl font-medium text-center mb-8 text-[#333]">
          Let's get you on your way!
        </h1>

        {!GOOGLE_MAPS_API_KEY && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <p className="font-bold mb-1">Google Maps API Key Missing</p>
            <p>Please add <code>GOOGLE_MAPS_API_KEY</code> to your secrets in AI Studio to enable address suggestions and distance calculations.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Trip Type Toggle */}
          <div className="flex border border-[#D4C185] rounded-lg overflow-hidden h-12">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tripType: 'one-way' }))}
              className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
                formData.tripType === 'one-way' 
                ? 'bg-[#FDF9EC] text-[#B49A4C]' 
                : 'bg-white text-[#8E8E8E]'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.tripType === 'one-way' ? 'bg-[#B49A4C] text-white' : 'bg-[#E0E0E0]'}`}>
                <ArrowRight className="w-3 h-3" />
              </div>
              <span className="font-medium">One-way</span>
            </button>
            <div className="w-[1px] bg-[#D4C185]" />
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tripType: 'hourly' }))}
              className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
                formData.tripType === 'hourly' 
                ? 'bg-[#FDF9EC] text-[#B49A4C]' 
                : 'bg-white text-[#8E8E8E]'
              }`}
            >
              <Hourglass className={`w-5 h-5 ${formData.tripType === 'hourly' ? 'text-[#B49A4C]' : 'text-[#8E8E8E]'}`} />
              <span className="font-medium">Hourly</span>
            </button>
          </div>

          {/* Pickup Section */}
          <div className="space-y-4">
            <h2 className="font-bold text-sm uppercase tracking-wider text-[#333]">Pickup</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative border border-[#E0E0E0] rounded-lg p-3 flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#B49A4C]" />
                <input
                  type="date"
                  name="pickupDate"
                  value={formData.pickupDate}
                  onChange={handleInputChange}
                  min={todayDate}
                  className="w-full outline-none text-[#4A4A4A]"
                />
              </div>
              <div className="relative border border-[#E0E0E0] rounded-lg p-3 flex items-center gap-3">
                <Clock className="w-5 h-5 text-[#B49A4C]" />
                <input
                  type="time"
                  name="pickupTime"
                  value={formData.pickupTime}
                  onChange={handleInputChange}
                  min={formData.pickupDate === todayDate ? getCurrentTime() : undefined}
                  className="w-full outline-none text-[#4A4A4A]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, pickupLocationType: 'location' }))}
                  className={`px-4 py-1 rounded-md text-sm border transition-colors ${
                    formData.pickupLocationType === 'location'
                    ? 'border-[#B49A4C] text-[#B49A4C] bg-[#FDF9EC]'
                    : 'border-[#E0E0E0] text-[#8E8E8E]'
                  }`}
                >
                  Location
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, pickupLocationType: 'airport' }))}
                  className={`px-4 py-1 rounded-md text-sm border transition-colors ${
                    formData.pickupLocationType === 'airport'
                    ? 'border-[#B49A4C] text-[#B49A4C] bg-[#FDF9EC]'
                    : 'border-[#E0E0E0] text-[#8E8E8E]'
                  }`}
                >
                  Airport
                </button>
              </div>

              <div className="relative">
                <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase">Location</div>
                <div className="border border-[#E0E0E0] rounded-lg p-3 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-[#B49A4C]" />
                  <input
                    ref={pickupInputRef}
                    type="text"
                    name="pickupLocation"
                    value={formData.pickupLocation}
                    onChange={handleInputChange}
                    className="w-full outline-none text-[#4A4A4A] pr-8"
                  />
                  <ChevronDown className="w-5 h-5 text-[#8E8E8E] absolute right-3" />
                </div>
              </div>
              <button type="button" className="text-[#B49A4C] text-sm font-medium hover:underline">+ Add a stop</button>
            </div>
          </div>

          {/* Drop off Section */}
          <div className="space-y-4">
            <h2 className="font-bold text-sm uppercase tracking-wider text-[#333]">Drop off</h2>
            
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, dropoffLocationType: 'location' }))}
                  className={`px-4 py-1 rounded-md text-sm border transition-colors ${
                    formData.dropoffLocationType === 'location'
                    ? 'border-[#B49A4C] text-[#B49A4C] bg-[#FDF9EC]'
                    : 'border-[#E0E0E0] text-[#8E8E8E]'
                  }`}
                >
                  Location
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, dropoffLocationType: 'airport' }))}
                  className={`px-4 py-1 rounded-md text-sm border transition-colors ${
                    formData.dropoffLocationType === 'airport'
                    ? 'border-[#B49A4C] text-[#B49A4C] bg-[#FDF9EC]'
                    : 'border-[#E0E0E0] text-[#8E8E8E]'
                  }`}
                >
                  Airport
                </button>
              </div>

              <div className="relative">
                <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase">Location</div>
                <div className="border border-[#E0E0E0] rounded-lg p-3 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-[#B49A4C]" />
                  <input
                    ref={dropoffInputRef}
                    type="text"
                    name="dropoffLocation"
                    value={formData.dropoffLocation}
                    onChange={handleInputChange}
                    className="w-full outline-none text-[#4A4A4A] pr-8"
                  />
                  <ChevronDown className="w-5 h-5 text-[#8E8E8E] absolute right-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Distance & Time Display */}
          {(travelInfo || isCalculating) && (
            <div className="bg-[#FDF9EC] border border-[#D4C185] rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#B49A4C] p-2 rounded-full text-white">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-[#8E8E8E] uppercase font-bold">Estimated Travel</p>
                  {isCalculating ? (
                    <div className="flex items-center gap-2 text-[#B49A4C] text-sm font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Calculating...
                    </div>
                  ) : (
                    <p className="text-[#4A4A4A] font-bold">
                      {travelInfo?.distance} • {travelInfo?.duration}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contact Information Section */}
          <div className="space-y-4">
            <h2 className="font-bold text-sm uppercase tracking-wider text-[#333]">Contact Information</h2>
            
            <div className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${errors.phoneNumber ? 'border-red-500' : 'border-[#E0E0E0]'}`}>
              <div className="flex items-center gap-2 pr-2 border-r border-[#E0E0E0]">
                <img 
                  src="https://flagcdn.com/w20/us.png" 
                  alt="US Flag" 
                  className="w-5 h-auto"
                  referrerPolicy="no-referrer"
                />
              </div>
              <input
                type="text"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                placeholder="+1 (555) 123-4567"
                className="w-full outline-none text-[#4A4A4A] placeholder:text-[#CCC]"
              />
            </div>
            {errors.phoneNumber && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.phoneNumber}</p>}

            {isRecognized ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <User className="w-4 h-4" />
                  Welcome back, {formData.firstName} {formData.lastName}!
                </div>
                <p className="text-green-700 text-xs ml-6">{formData.email}</p>
              </div>
            ) : (
              <>
                <p className="text-[13px] text-[#666] leading-tight">
                  We don't have that phone number on file. Please provide additional contact information.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase">First name</div>
                    <div className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${errors.firstName ? 'border-red-500' : 'border-[#E0E0E0]'}`}>
                      <User className="w-5 h-5 text-[#B49A4C]" />
                      <input
                        type="text"
                        name="firstName"
                        placeholder="First name"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className="w-full outline-none text-[#4A4A4A] placeholder:text-[#CCC]"
                      />
                    </div>
                    {errors.firstName && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.firstName}</p>}
                  </div>
                  <div className="relative">
                    <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase">Last name</div>
                    <div className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${errors.lastName ? 'border-red-500' : 'border-[#E0E0E0]'}`}>
                      <User className="w-5 h-5 text-[#B49A4C]" />
                      <input
                        type="text"
                        name="lastName"
                        placeholder="Last name"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className="w-full outline-none text-[#4A4A4A] placeholder:text-[#CCC]"
                      />
                    </div>
                    {errors.lastName && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase">Email</div>
                  <div className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${errors.email ? 'border-red-500' : 'border-[#E0E0E0]'}`}>
                    <Mail className="w-5 h-5 text-[#B49A4C]" />
                    <input
                      type="email"
                      name="email"
                      placeholder="name@example.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full outline-none text-[#4A4A4A] placeholder:text-[#CCC]"
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.email}</p>}
                </div>
              </>
            )}
          </div>

          {/* Passengers Section */}
          <div className="space-y-4">
            <p className="text-sm text-[#666]">How many passengers are expected for the trip?</p>
            <div className="relative w-full sm:w-1/2">
              <div className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#8E8E8E] uppercase"># Passengers</div>
              <div className={`border rounded-lg p-3 flex items-center gap-3 transition-colors ${errors.passengers ? 'border-red-500' : 'border-[#E0E0E0]'}`}>
                <span className="text-[#B49A4C] font-bold">#</span>
                <input
                  type="number"
                  name="passengers"
                  placeholder=""
                  value={formData.passengers}
                  onChange={handleInputChange}
                  className="w-full outline-none text-[#4A4A4A]"
                />
              </div>
              {errors.passengers && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.passengers}</p>}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#D4C185] hover:bg-[#B49A4C] text-white font-bold py-4 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
            {isSubmitting ? 'Processing...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
