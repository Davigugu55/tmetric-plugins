//
//  AppDelegate.swift
//  TMetric for Safari
//
//  Copyright © 2021 Devart. All rights reserved.
//

import Cocoa

@NSApplicationMain
class AppDelegate: NSObject, NSApplicationDelegate {
    
    func applicationDidFinishLaunching(_ aNotification: Notification) {
        // Insert code here to initialize your application
    }
    
    func applicationWillTerminate(_ aNotification: Notification) {
        // Insert code here to tear down your application
    }
    
    
    @IBAction func openTMetricHelp(_ sender: AnyObject?) {
        let url = URL(string: "https://tmetric.com/help/apps/browser-extension")
        NSWorkspace.shared.open(url!)
    }
}
