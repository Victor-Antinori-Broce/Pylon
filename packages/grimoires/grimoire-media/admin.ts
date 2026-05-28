/**
 * Media Library Admin Configuration
 * 
 * Configures the admin panel for Media Library.
 */

// GrimoireAdminConfig was removed from @gremius/shared — inline the type
interface GrimoireAdminConfig {
  views?: Array<{
    label: string;
    slug: string;
    icon?: string;
    defaultView?: boolean;
    component?: string;
  }>;
  category?: string;
  order?: number;
}

/**
 * Admin configuration for Media Library
 */
export const adminConfig: GrimoireAdminConfig = {
  views: [
    {
      label: "Media Library",
      slug: "media",
      icon: "Image",
      defaultView: true,
      component: "Media", // References custom view
    },
    {
      label: "Folders",
      slug: "folders",
      icon: "Folder",
      defaultView: false,
    },
    {
      label: "Upload",
      slug: "upload",
      icon: "Upload",
      defaultView: false,
    },
  ],
};
