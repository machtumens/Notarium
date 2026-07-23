# Founders Photos Setup

To complete the Founders feature, please add 5 founder photos to the `/public` directory.

## Required Photos

Add the following image files to `/public`:

1. `per.1.jpg` - Founder 1 photo
2. `per.2.jpg` - Founder 2 photo
3. `per.3.jpg` - Founder 3 photo
4. `per.4.jpg` - Founder 4 photo
5. `per.5.jpg` - Founder 5 photo

## Recommended Image Specifications

- Format: JPG or PNG
- Dimensions: Square aspect ratio (e.g., 500x500px or 1000x1000px)
- Size: Keep under 500KB for optimal performance
- Style: Professional headshots with good lighting

## Customizing Founder Information

After adding the photos, update the founder names, roles, and contributions in:
`src/components/FoundersModal.tsx`

Edit the `founders` array (lines 19-50) with the actual founder information:

```typescript
const founders: Founder[] = [
  {
    name: 'Your Name',
    role: 'Your Role',
    contribution: 'Brief description of their contribution to the platform.',
    photo: '/per.1.jpg',
  },
  // ... etc
];
```

## Features

### Desktop View

- Shows all founder information (photo, name, role, contribution) at once
- Hover effects on cards
- Contribution displayed in highlighted boxes

### Mobile View

- Compact list showing photo and name initially
- Tap on any founder to expand and see their role and contribution
- Smooth expand/collapse animations
- Visual indicator (arrow) shows expand state

## How to Access

Users can click the "Meet the Founders" button in the footer to view the founders popup with photos and information.
