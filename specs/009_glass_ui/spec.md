Few components we currently have in the app should have liquid glass UI.

## Select import source

Instead of the modal, we should display a pop-over with two options - each with an icon on the left and a text label
next to it. The pop-over should appear in place of the (+) button and the search input. It should be displayed until
the user selects some option or taps outside. We must ensure that once the import process finishes, the list disappears
and we again show the (+) button and the search input.

For the popover example, see the attached image.

![import source](import_source.png)

## Add new recipe source

When on the recipe source selection screen the user selects "Add new source", we want to replace the select box with
an input. The input should allow entering name of the new source. The (x) and (✅) buttons should, respectively, cancel
adding the new source and go back to the selector component, and confirm the edition. The input should be autofocused

- when the user selects the "Add new source" option, they should see a keyboard and be able to start writing.

## Visual style

What's important - both new components should use liquid glass style and native components.
