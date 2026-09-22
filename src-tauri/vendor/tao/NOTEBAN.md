# Noteban's Tao backport

Source: https://github.com/tauri-apps/tao/tree/c84a010d546c7fdf716bb6be97cc2038bdc62070

This is Tao 0.35.3 with its matching tao-macros package. Source, package manifests,
licenses, formatting configuration, and upstream README are retained; examples,
upstream CI, and standalone integration tests are not included.

The pinned revision already contains the UISceneConfiguration lifetime fix from
https://github.com/tauri-apps/tao/pull/1245.

Noteban additionally backports the scene-lifecycle predicate from
https://github.com/tauri-apps/tao/commit/a3ff3f035f3f5886a45af0533532e568ca57e91b:

- Scene lifecycle adoption depends on the presence of UIApplicationSceneManifest.
- Delegate registration, initial scene attachment, and deferred app startup use
  that predicate, regardless of UIApplicationSupportsMultipleScenes.
- Actual multi-window support still comes from UIApplication.supportsMultipleScenes.

This lets Noteban declare UIApplicationSupportsMultipleScenes=false without losing
its main window on iPadOS 27. The changed code is confined to
src/platform_impl/ios/{scene,view,app_state}.rs. Other upstream changes from the newer
Tao release are intentionally not included because Tauri currently requires 0.35.x.

Remove this package and the Cargo patch when the supported Tauri dependency range
includes both upstream fixes. Do not re-enable multiple scenes until Noteban handles
additional windows and their state and capability requirements.
