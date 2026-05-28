/**
 * Media Library Admin Configuration
 *
 * Configures the admin panel for Media Library.
 */
/**
 * Admin configuration for Media Library
 */
export const adminConfig = {
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
//# sourceMappingURL=admin.js.map