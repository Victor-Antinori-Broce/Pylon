export default (app) => {
    app.config.errorHandler = (err, instance, info) => {
        console.error("[Vue Island Error]", info, err);
    };
};
//# sourceMappingURL=_app.js.map