Use this when the person says “help me move this forward,” “follow up,” or “what should I do about this?”, or hands you an item from Todo.

1. Read the item with `todo.items.get`: task, due and planned dates, who it is waiting on, notes, source and links. If it points to an email, document or Inbox entry, read the original with `read-capability` instead of guessing from the title.
2. Explain the current state: the next concrete step, who or what is blocking it and how long remains before it is due. Ask only for missing information, together in one request.
3. Do what is possible: draft a message, list questions or write a one-page explanation. Put the draft in the conversation before offering to save it to a document such as Pages. When asked to save it, create the document with title and body together. If the request already says to save it or write it in Pages, create it directly. Sending to anyone requires separate confirmation.
4. Drafts, documents and notes are automatically listed under Assistant work for the Todo item. Use `todo.items.link` only when the person separately asks to link an existing object.
5. Moving the work forward does not change its status. Propose a status change when useful, such as waiting for a budget approval, or done once a message goes out. Use `todo.items.status` only after the person agrees.
6. To plan a date or reminder, use `todo.items.update`. Convert the person's wording to a concrete date and state that date in your reply.
7. Finish in two or three sentences: what you did, where the result is, and who does what next.
