package com.mori.form.probe;

import android.app.Instrumentation;
import android.app.Activity;
import android.graphics.Rect;
import android.os.Bundle;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import org.xmlpull.v1.XmlSerializer;

/** Snapshot visible accessibility state without waiting for an animated timer to become idle.
 * This observes the foreground app only; it does not read or modify FORM's private database.
 */
public final class HierarchyProbe extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
            if (root == null) throw new IllegalStateException("No active accessibility window");
            File target = new File(getContext().getFilesDir(), "ui.xml");
            try (FileOutputStream output = new FileOutputStream(target)) {
                XmlSerializer xml = Xml.newSerializer();
                xml.setOutput(output, "UTF-8"); xml.startDocument("UTF-8", true);
                xml.startTag(null, "hierarchy");
                write(xml, root, 0);
                xml.endTag(null, "hierarchy"); xml.endDocument();
            }
            result.putString("stream", "FORM_PROBE_OK");
            finish(Activity.RESULT_OK, result);
        } catch (Exception error) {
            result.putString("stream", "FORM_PROBE_FAILED: " + error);
            finish(Activity.RESULT_CANCELED, result);
        }
    }
    private static String value(CharSequence value) { return value == null ? "" : value.toString(); }
    private static void write(XmlSerializer xml, AccessibilityNodeInfo node, int depth) throws Exception {
        if (depth > 100) throw new IllegalStateException("Unexpected accessibility tree depth");
        Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
        xml.startTag(null, "node");
        xml.attribute(null, "text", value(node.getText()));
        xml.attribute(null, "content-desc", value(node.getContentDescription()));
        xml.attribute(null, "package", value(node.getPackageName()));
        xml.attribute(null, "class", value(node.getClassName()));
        xml.attribute(null, "selected", String.valueOf(node.isSelected()));
        xml.attribute(null, "checked", String.valueOf(node.isChecked()));
        xml.attribute(null, "clickable", String.valueOf(node.isClickable()));
        xml.attribute(null, "enabled", String.valueOf(node.isEnabled()));
        xml.attribute(null, "visible-to-user", String.valueOf(node.isVisibleToUser()));
        xml.attribute(null, "bounds", "["+bounds.left+","+bounds.top+"]["+bounds.right+","+bounds.bottom+"]");
        for (int i=0; i<node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) write(xml, child, depth+1);
        }
        xml.endTag(null, "node");
    }
}
