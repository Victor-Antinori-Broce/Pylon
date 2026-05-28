/**
 * Media Grimoire Configuration Schema
 *
 * Define y valida la configuración del Media Library.
 */
import { z } from "zod";
export declare const minioStorageSchema: z.ZodObject<{
    provider: z.ZodLiteral<"minio">;
    endpoint: z.ZodDefault<z.ZodString>;
    bucket: z.ZodDefault<z.ZodString>;
    accessKey: z.ZodOptional<z.ZodString>;
    secretKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
    useSSL: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    provider: "minio";
    endpoint: string;
    bucket: string;
    useSSL: boolean;
    accessKey?: string | undefined;
    secretKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    provider: "minio";
    endpoint?: string | undefined;
    bucket?: string | undefined;
    useSSL?: boolean | undefined;
    accessKey?: string | undefined;
    secretKey?: string | undefined;
    publicUrl?: string | undefined;
}>;
export declare const s3StorageSchema: z.ZodObject<{
    provider: z.ZodLiteral<"s3">;
    region: z.ZodDefault<z.ZodString>;
    bucket: z.ZodString;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "s3";
    region: string;
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    provider: "s3";
    bucket: string;
    region?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}>;
export declare const localStorageSchema: z.ZodObject<{
    provider: z.ZodLiteral<"local">;
    path: z.ZodDefault<z.ZodString>;
    publicUrl: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    provider: "local";
    publicUrl: string;
}, {
    provider: "local";
    path?: string | undefined;
    publicUrl?: string | undefined;
}>;
export declare const r2StorageSchema: z.ZodObject<{
    provider: z.ZodLiteral<"r2">;
    accountId: z.ZodString;
    bucket: z.ZodString;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    provider: "r2";
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    accountId: string;
    provider: "r2";
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}>;
export declare const storageConfigSchema: z.ZodDiscriminatedUnion<"provider", [z.ZodObject<{
    provider: z.ZodLiteral<"minio">;
    endpoint: z.ZodDefault<z.ZodString>;
    bucket: z.ZodDefault<z.ZodString>;
    accessKey: z.ZodOptional<z.ZodString>;
    secretKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
    useSSL: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    provider: "minio";
    endpoint: string;
    bucket: string;
    useSSL: boolean;
    accessKey?: string | undefined;
    secretKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    provider: "minio";
    endpoint?: string | undefined;
    bucket?: string | undefined;
    useSSL?: boolean | undefined;
    accessKey?: string | undefined;
    secretKey?: string | undefined;
    publicUrl?: string | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"s3">;
    region: z.ZodDefault<z.ZodString>;
    bucket: z.ZodString;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    provider: "s3";
    region: string;
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    provider: "s3";
    bucket: string;
    region?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"local">;
    path: z.ZodDefault<z.ZodString>;
    publicUrl: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    provider: "local";
    publicUrl: string;
}, {
    provider: "local";
    path?: string | undefined;
    publicUrl?: string | undefined;
}>, z.ZodObject<{
    provider: z.ZodLiteral<"r2">;
    accountId: z.ZodString;
    bucket: z.ZodString;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    publicUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    accountId: string;
    provider: "r2";
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}, {
    accountId: string;
    provider: "r2";
    bucket: string;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    publicUrl?: string | undefined;
}>]>;
export declare const mediaFeaturesSchema: z.ZodObject<{
    thumbnails: z.ZodDefault<z.ZodBoolean>;
    imageOptimization: z.ZodDefault<z.ZodBoolean>;
    signedUrls: z.ZodDefault<z.ZodBoolean>;
    maxFileSize: z.ZodDefault<z.ZodNumber>;
    allowedTypes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    maxFileSize: number;
    thumbnails: boolean;
    imageOptimization: boolean;
    signedUrls: boolean;
    allowedTypes: string[];
}, {
    maxFileSize?: number | undefined;
    thumbnails?: boolean | undefined;
    imageOptimization?: boolean | undefined;
    signedUrls?: boolean | undefined;
    allowedTypes?: string[] | undefined;
}>;
export declare const mediaGrimoireConfigSchema: z.ZodObject<{
    storage: z.ZodDiscriminatedUnion<"provider", [z.ZodObject<{
        provider: z.ZodLiteral<"minio">;
        endpoint: z.ZodDefault<z.ZodString>;
        bucket: z.ZodDefault<z.ZodString>;
        accessKey: z.ZodOptional<z.ZodString>;
        secretKey: z.ZodOptional<z.ZodString>;
        publicUrl: z.ZodOptional<z.ZodString>;
        useSSL: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        provider: "minio";
        endpoint: string;
        bucket: string;
        useSSL: boolean;
        accessKey?: string | undefined;
        secretKey?: string | undefined;
        publicUrl?: string | undefined;
    }, {
        provider: "minio";
        endpoint?: string | undefined;
        bucket?: string | undefined;
        useSSL?: boolean | undefined;
        accessKey?: string | undefined;
        secretKey?: string | undefined;
        publicUrl?: string | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"s3">;
        region: z.ZodDefault<z.ZodString>;
        bucket: z.ZodString;
        accessKeyId: z.ZodOptional<z.ZodString>;
        secretAccessKey: z.ZodOptional<z.ZodString>;
        publicUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        provider: "s3";
        region: string;
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    }, {
        provider: "s3";
        bucket: string;
        region?: string | undefined;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"local">;
        path: z.ZodDefault<z.ZodString>;
        publicUrl: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        provider: "local";
        publicUrl: string;
    }, {
        provider: "local";
        path?: string | undefined;
        publicUrl?: string | undefined;
    }>, z.ZodObject<{
        provider: z.ZodLiteral<"r2">;
        accountId: z.ZodString;
        bucket: z.ZodString;
        accessKeyId: z.ZodOptional<z.ZodString>;
        secretAccessKey: z.ZodOptional<z.ZodString>;
        publicUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        accountId: string;
        provider: "r2";
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    }, {
        accountId: string;
        provider: "r2";
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    }>]>;
    features: z.ZodObject<{
        thumbnails: z.ZodDefault<z.ZodBoolean>;
        imageOptimization: z.ZodDefault<z.ZodBoolean>;
        signedUrls: z.ZodDefault<z.ZodBoolean>;
        maxFileSize: z.ZodDefault<z.ZodNumber>;
        allowedTypes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        maxFileSize: number;
        thumbnails: boolean;
        imageOptimization: boolean;
        signedUrls: boolean;
        allowedTypes: string[];
    }, {
        maxFileSize?: number | undefined;
        thumbnails?: boolean | undefined;
        imageOptimization?: boolean | undefined;
        signedUrls?: boolean | undefined;
        allowedTypes?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    features: {
        maxFileSize: number;
        thumbnails: boolean;
        imageOptimization: boolean;
        signedUrls: boolean;
        allowedTypes: string[];
    };
    storage: {
        provider: "minio";
        endpoint: string;
        bucket: string;
        useSSL: boolean;
        accessKey?: string | undefined;
        secretKey?: string | undefined;
        publicUrl?: string | undefined;
    } | {
        provider: "s3";
        region: string;
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    } | {
        path: string;
        provider: "local";
        publicUrl: string;
    } | {
        accountId: string;
        provider: "r2";
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    };
}, {
    features: {
        maxFileSize?: number | undefined;
        thumbnails?: boolean | undefined;
        imageOptimization?: boolean | undefined;
        signedUrls?: boolean | undefined;
        allowedTypes?: string[] | undefined;
    };
    storage: {
        provider: "minio";
        endpoint?: string | undefined;
        bucket?: string | undefined;
        useSSL?: boolean | undefined;
        accessKey?: string | undefined;
        secretKey?: string | undefined;
        publicUrl?: string | undefined;
    } | {
        provider: "s3";
        bucket: string;
        region?: string | undefined;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    } | {
        provider: "local";
        path?: string | undefined;
        publicUrl?: string | undefined;
    } | {
        accountId: string;
        provider: "r2";
        bucket: string;
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        publicUrl?: string | undefined;
    };
}>;
export type MinioStorageConfig = z.infer<typeof minioStorageSchema>;
export type S3StorageConfig = z.infer<typeof s3StorageSchema>;
export type LocalStorageConfig = z.infer<typeof localStorageSchema>;
export type R2StorageConfig = z.infer<typeof r2StorageSchema>;
export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type MediaFeaturesConfig = z.infer<typeof mediaFeaturesSchema>;
export type MediaGrimoireConfig = z.infer<typeof mediaGrimoireConfigSchema>;
export declare const defaultMediaConfig: MediaGrimoireConfig;
export declare function validateMediaConfig(config: unknown): {
    valid: true;
    data: MediaGrimoireConfig;
} | {
    valid: false;
    error: string;
};
export declare const storageProviders: ({
    id: "minio";
    label: string;
    description: string;
    icon: string;
    fields: ({
        key: string;
        label: string;
        type: string;
        placeholder: string;
    } | {
        key: string;
        label: string;
        type: string;
        placeholder?: undefined;
    })[];
} | {
    id: "s3";
    label: string;
    description: string;
    icon: string;
    fields: {
        key: string;
        label: string;
        type: string;
        placeholder: string;
    }[];
} | {
    id: "local";
    label: string;
    description: string;
    icon: string;
    fields: {
        key: string;
        label: string;
        type: string;
        placeholder: string;
    }[];
} | {
    id: "r2";
    label: string;
    description: string;
    icon: string;
    fields: {
        key: string;
        label: string;
        type: string;
        placeholder: string;
    }[];
})[];
//# sourceMappingURL=config.schema.d.ts.map