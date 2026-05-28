// Custom UIInputAccessoryView for the WKWebView keyboard.
//
// The WKWebView's keyboard accessory view is exposed by an internal class
// named WKContentView. We can't subclass it directly (private), but we can
// replace its -inputAccessoryView implementation at runtime via the
// Objective-C runtime. The class name has been stable from iOS 11 through
// iOS 18; if Apple ever renames it the lookup returns nil and the system
// bar reappears (acceptable degradation).
//
// On button tap we evaluate a JavaScript expression in the enclosing
// WKWebView; the JS side (`src/lib/accessoryBridge.ts`) routes the action
// into the active CodeMirror EditorView.

#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

#pragma mark - Per-button target

@interface NotebanAccessoryButton : NSObject
@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic, copy) NSString *action;
- (void)fire;
@end

@implementation NotebanAccessoryButton
- (void)fire {
    WKWebView *web = self.webView;
    if (!web) return;
    NSString *escaped = [self.action stringByReplacingOccurrencesOfString:@"'"
                                                              withString:@"\\'"];
    NSString *js = [NSString stringWithFormat:
        @"window.__notebanAccessory && window.__notebanAccessory.fire('%@');",
        escaped];
    [web evaluateJavaScript:js completionHandler:nil];
}
@end

#pragma mark - Toolbar construction

static const void * NotebanAccessoryKey = &NotebanAccessoryKey;
static const void * NotebanAccessoryTargetsKey = &NotebanAccessoryTargetsKey;

static UIBarButtonItem * NotebanMakeButton(NSString *title,
                                           NSString *action,
                                           WKWebView *webView,
                                           NSMutableArray *retain) {
    NotebanAccessoryButton *target = [NotebanAccessoryButton new];
    target.webView = webView;
    target.action = action;
    [retain addObject:target];
    UIBarButtonItem *item = [[UIBarButtonItem alloc] initWithTitle:title
                                                             style:UIBarButtonItemStylePlain
                                                            target:target
                                                            action:@selector(fire)];
    return item;
}

static UIBarButtonItem * NotebanFlex(void) {
    return [[UIBarButtonItem alloc]
            initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace
            target:nil action:nil];
}

static UIToolbar * NotebanBuildToolbar(WKWebView *webView) {
    // System resizes the input accessory view to the keyboard width via the
    // autoresizing mask; the initial width here is a placeholder.
    UIToolbar *bar = [[UIToolbar alloc]
        initWithFrame:CGRectMake(0, 0, 320, 44)];
    bar.barStyle = UIBarStyleDefault;
    bar.translucent = YES;
    bar.autoresizingMask = UIViewAutoresizingFlexibleWidth;

    NSMutableArray<UIBarButtonItem *> *items = [NSMutableArray array];
    NSMutableArray *targets = [NSMutableArray array];

    // Markdown character buttons.
    NSArray<NSArray<NSString *> *> *chars = @[
        @[@"#",  @"hash"],
        @[@"[",  @"lbracket"],
        @[@"]",  @"rbracket"],
        @[@"-",  @"dash"],
        @[@"*",  @"star"],
        @[@"`",  @"backtick"],
        @[@">",  @"gt"],
        @[@"_",  @"underscore"],
        @[@"!",  @"bang"],
        @[@"|",  @"pipe"],
        @[@"~",  @"tilde"],
    ];
    for (NSArray<NSString *> *pair in chars) {
        [items addObject:NotebanMakeButton(pair[0], pair[1], webView, targets)];
        [items addObject:NotebanFlex()];
    }

    // Indent / outdent group.
    [items addObject:NotebanMakeButton(@"⇤", @"outdent", webView, targets)];
    [items addObject:NotebanMakeButton(@"⇥", @"indent",  webView, targets)];
    [items addObject:NotebanFlex()];

    // Undo / redo on the right edge.
    [items addObject:NotebanMakeButton(@"↶", @"undo", webView, targets)];
    [items addObject:NotebanMakeButton(@"↷", @"redo", webView, targets)];

    bar.items = items;

    // Keep the per-button targets alive for the lifetime of the toolbar.
    objc_setAssociatedObject(bar, NotebanAccessoryTargetsKey, targets,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return bar;
}

#pragma mark - Swizzled -inputAccessoryView

static UIView * NotebanReplacementAccessoryView(id self, SEL _cmd) {
    UIView *cached = objc_getAssociatedObject(self, NotebanAccessoryKey);
    if (cached) return cached;

    UIView *view = (UIView *)self;
    while (view && ![view isKindOfClass:[WKWebView class]]) {
        view = view.superview;
    }
    if (!view) return nil;

    UIToolbar *bar = NotebanBuildToolbar((WKWebView *)view);
    objc_setAssociatedObject(self, NotebanAccessoryKey, bar,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return bar;
}

#pragma mark - Public installer

// Called from main.mm before the Rust entry point spins up the WKWebView.
// Resolves the private WKContentView class at runtime and swaps its
// -inputAccessoryView implementation. Idempotent.
extern "C" void noteban_install_input_accessory(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Class wkContent = NSClassFromString(@"WKContentView");
        if (!wkContent) {
            NSLog(@"[Noteban] WKContentView not found; accessory toolbar disabled");
            return;
        }

        SEL sel = @selector(inputAccessoryView);
        Method existing = class_getInstanceMethod(wkContent, sel);
        if (existing) {
            method_setImplementation(existing,
                                     (IMP)NotebanReplacementAccessoryView);
            NSLog(@"[Noteban] accessory toolbar installed (replaced existing IMP)");
        } else {
            class_addMethod(wkContent, sel,
                            (IMP)NotebanReplacementAccessoryView, "@@:");
            NSLog(@"[Noteban] accessory toolbar installed (added new method)");
        }
    });
}
