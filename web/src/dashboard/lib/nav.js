/** Navigation per view mode, shared by the rail, the header and the search. */
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid', modes: ['investor', 'buyer'], title: () => 'Dubai property market', sub: 'Official DLD sales, the outlook by area and what to act on now' },
  { id: 'outlook', label: 'Market outlook', icon: 'bars', modes: ['investor'], title: () => 'Market outlook', sub: 'Next-quarter forecast and direction for every area segment' },
  { id: 'news', label: 'News', icon: 'note', modes: ['investor'], title: () => 'Verified news', sub: 'Property and city news from approved official and press sources only' },
  { id: 'listings', label: 'Listings', icon: 'building', modes: ['buyer'], title: () => 'Homes for sale', sub: 'Demo listings priced from real DLD price per m²' },
  { id: 'viewings', label: 'Viewings', icon: 'calendar', modes: ['buyer'], title: () => 'Your viewings', sub: 'Viewings Estaro booked for you' },
]

export const navFor = (mode) => NAV.filter((n) => n.modes.includes(mode))

export const STARTERS = {
  investor: [
    { icon: 'trend', text: 'Which areas are forecast to sell the most next quarter?' },
    { icon: 'bars', text: 'What is the outlook for Jumeirah Village Circle?' },
    { icon: 'sparkle', text: 'Find off-plan homes under AED 1,500,000 in rising areas' },
    { icon: 'building', text: 'Compare Dubai Marina and Business Bay' },
  ],
  buyer: [
    { icon: 'building', text: 'Find me a 2-bed under AED 2,000,000 and book a viewing' },
    { icon: 'search', text: 'Show ready homes in Jumeirah Village Circle under AED 1,200,000' },
    { icon: 'trend', text: 'Is Dubai Marina rising or falling?' },
    { icon: 'calendar', text: 'What viewings have I booked?' },
  ],
}
