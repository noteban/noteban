// Custom keyboard shortcut bar for the WKWebView editor.
//
// Uses iOS's UITextInputAssistantItem (the rounded pill that lives in the
// QuickType bar) rather than a full-width UIInputAccessoryView toolbar.
// Same mechanism Safari / Vivaldi use for autofill icons: tight, native
// look that doesn't push the keyboard down or eat vertical space.
//
// On a focused contentEditable inside WKWebView the first responder is
// the private WKContentView class. We can't subclass it, but we can swap
// -inputAssistantItem (and silence -inputAccessoryView so the default
// "Done / prev / next" form-navigation bar disappears) at runtime via
// the Objective-C runtime. The class name has been stable from iOS 11
// through iOS 18; if Apple ever renames it the lookup returns nil and
// the default behaviour is restored (acceptable degradation).
//
// On button tap we evaluate a JavaScript expression in the enclosing
// WKWebView; the JS side (`src/lib/accessoryBridge.ts`) routes the
// action into the active CodeMirror EditorView.

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

#pragma mark - Group construction

static const void * NotebanAssistantKey = &NotebanAssistantKey;
static const void * NotebanTargetsKey   = &NotebanTargetsKey;

static UIBarButtonItem * NotebanCharButton(NSString *title,
                                           NSString *action,
                                           WKWebView *webView,
                                           NSMutableArray *retain) {
    NotebanAccessoryButton *t = [NotebanAccessoryButton new];
    t.webView = webView;
    t.action = action;
    [retain addObject:t];
    return [[UIBarButtonItem alloc] initWithTitle:title
                                            style:UIBarButtonItemStylePlain
                                           target:t
                                           action:@selector(fire)];
}

static UIBarButtonItem * NotebanIconButton(NSString *symbolName,
                                           NSString *action,
                                           WKWebView *webView,
                                           NSMutableArray *retain) {
    NotebanAccessoryButton *t = [NotebanAccessoryButton new];
    t.webView = webView;
    t.action = action;
    [retain addObject:t];
    UIImage *img = [UIImage systemImageNamed:symbolName];
    return [[UIBarButtonItem alloc] initWithImage:img
                                            style:UIBarButtonItemStylePlain
                                           target:t
                                           action:@selector(fire)];
}

static UITextInputAssistantItem * NotebanBuildAssistantItem(WKWebView *webView) {
    NSMutableArray *targets = [NSMutableArray array];

    NSArray<NSArray<NSString *> *> *charSpec = @[
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

    NSMutableArray<UIBarButtonItem *> *charItems = [NSMutableArray array];
    for (NSArray<NSString *> *pair in charSpec) {
        [charItems addObject:NotebanCharButton(pair[0], pair[1], webView, targets)];
    }
    UIBarButtonItemGroup *charsGroup =
        [[UIBarButtonItemGroup alloc] initWithBarButtonItems:charItems
                                          representativeItem:nil];

    UIBarButtonItemGroup *indentGroup = [[UIBarButtonItemGroup alloc]
        initWithBarButtonItems:@[
            NotebanIconButton(@"decrease.indent", @"outdent", webView, targets),
            NotebanIconButton(@"increase.indent", @"indent",  webView, targets),
        ]
        representativeItem:nil];

    UIBarButtonItemGroup *historyGroup = [[UIBarButtonItemGroup alloc]
        initWithBarButtonItems:@[
            NotebanIconButton(@"arrow.uturn.backward", @"undo", webView, targets),
            NotebanIconButton(@"arrow.uturn.forward",  @"redo", webView, targets),
        ]
        representativeItem:nil];

    UITextInputAssistantItem *item = [UITextInputAssistantItem new];
    // Leading groups appear on the left of the QuickType pill, trailing on
    // the right. Putting characters trailing matches the Vivaldi/Safari
    // autofill pattern and leaves space for system-suggested completions
    // on the leading edge when iOS still wants to show them.
    item.leadingBarButtonGroups  = @[ indentGroup, historyGroup ];
    item.trailingBarButtonGroups = @[ charsGroup ];

    objc_setAssociatedObject(item, NotebanTargetsKey, targets,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return item;
}

#pragma mark - Swizzled getters

static UITextInputAssistantItem * NotebanReplacementAssistantItem(id self, SEL _cmd) {
    UITextInputAssistantItem *cached =
        objc_getAssociatedObject(self, NotebanAssistantKey);
    if (cached) return cached;

    UIView *view = (UIView *)self;
    while (view && ![view isKindOfClass:[WKWebView class]]) {
        view = view.superview;
    }
    if (!view) {
        return [UITextInputAssistantItem new];
    }

    UITextInputAssistantItem *item = NotebanBuildAssistantItem((WKWebView *)view);
    objc_setAssociatedObject(self, NotebanAssistantKey, item,
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return item;
}

// Returning nil here suppresses the default "Done / previous / next" form
// navigation bar that WKContentView would otherwise stack above the
// QuickType pill — Safari/Vivaldi style.
static UIView * NotebanNilAccessoryView(id self, SEL _cmd) {
    return nil;
}

#pragma mark - Public installer

// Called from main.mm before the Rust entry point spins up the WKWebView.
// Resolves the private WKContentView class at runtime and swaps the two
// responder hooks. Idempotent.
extern "C" void noteban_install_input_accessory(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        Class wkContent = NSClassFromString(@"WKContentView");
        if (!wkContent) {
            NSLog(@"[Noteban] WKContentView not found; accessory bar disabled");
            return;
        }

        // inputAssistantItem — install our QuickType-pill buttons.
        {
            SEL sel = @selector(inputAssistantItem);
            Method existing = class_getInstanceMethod(wkContent, sel);
            if (existing) {
                method_setImplementation(existing,
                    (IMP)NotebanReplacementAssistantItem);
            } else {
                class_addMethod(wkContent, sel,
                    (IMP)NotebanReplacementAssistantItem, "@@:");
            }
        }

        // inputAccessoryView — return nil so the default bulky bar
        // disappears. Done/prev/next form navigation isn't useful in a
        // single-textarea editor anyway.
        {
            SEL sel = @selector(inputAccessoryView);
            Method existing = class_getInstanceMethod(wkContent, sel);
            if (existing) {
                method_setImplementation(existing, (IMP)NotebanNilAccessoryView);
            } else {
                class_addMethod(wkContent, sel,
                    (IMP)NotebanNilAccessoryView, "@@:");
            }
        }

        NSLog(@"[Noteban] accessory bar installed on WKContentView");
    });
}
