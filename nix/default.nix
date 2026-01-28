{ lib
, appimageTools
, fetchurl
, gtk3
, libayatana-appindicator
, webkitgtk_4_0 ? null
, webkitgtk_4_1 ? null
}:

let
  pname = "noteban";
  version = "3.2.6";
  webkitgtk = if webkitgtk_4_0 != null then webkitgtk_4_0 else webkitgtk_4_1;

  src = fetchurl {
    url = "https://github.com/noteban/noteban/releases/download/v${version}/Noteban_${version}_amd64.AppImage";
    hash = "sha256-iurrtvjU5X0J/yAT0qzaVIWD5QMPzcC6YRgmQecRwBg=";
  };

  appimageContents = appimageTools.extractType2 { inherit pname version src; };
in
assert webkitgtk != null;
appimageTools.wrapType2 {
  inherit pname version src;

  extraPkgs = _: [
    gtk3
    libayatana-appindicator
    webkitgtk
  ];

  extraInstallCommands = ''
    # Install desktop file
    install -Dm644 ${appimageContents}/usr/share/applications/Noteban.desktop \
      $out/share/applications/noteban.desktop

    # Fix desktop file Exec path
    substituteInPlace $out/share/applications/noteban.desktop \
      --replace-fail 'Exec=noteban' "Exec=$out/bin/noteban"

    # Install icons
    install -Dm644 ${appimageContents}/usr/share/icons/hicolor/32x32/apps/noteban.png \
      $out/share/icons/hicolor/32x32/apps/noteban.png
    install -Dm644 ${appimageContents}/usr/share/icons/hicolor/128x128/apps/noteban.png \
      $out/share/icons/hicolor/128x128/apps/noteban.png
    install -Dm644 ${appimageContents}/usr/share/icons/hicolor/256x256@2/apps/noteban.png \
      $out/share/icons/hicolor/256x256/apps/noteban.png
  '';

  meta = with lib; {
    description = "A notes-first app with kanban organization";
    homepage = "https://github.com/noteban/noteban";
    license = licenses.mit;
    maintainers = [ ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "noteban";
  };
}
