# Blackjack

## Requirements

Two players: You and the Dealer

### Deck

- A deck is represented as a json list of Card objects.
- Your application should accept an URL on the command line. You should do a GET against this URL. This will give you the deck we expect you to play the game with
  - TheresponsewillcontainajsonlistofCardobjects: `{"suit":"HEARTS","value":"5"}`, where suit is one of HEARTS | CLUBS | SPADES | DIAMONDS and value is one of the set 2,3,4,5,6,7,8,9,10,J,Q,K,A
- If no URL is given on the command line, you should default to GET https://sandbox.getunleash.io/blackjack/shuffle

### Values

- Face cards (J, Q, K) has value 10, Aces (A) have value 11, number cards have the value their number states

### Gameplay

- One round of the game goes like this:
  - You’ll draw two cards first.
  - Dealer then draws two cards.
  - If neither player has Blackjack (21) after the initial draw, go to rest of game
  - If both players have Blackjack, Dealer wins
  - You’ll draw cards until you have 17 or higher, you’ll go bust and lose if your score is above 21
  - Once you’re done drawing, if you haven’t busted, it’s the Dealer’s turn.
  - Dealer will draw until he has a higher score than you or goes bust (ends up with a score over 21)

### Further clarification

- If player is bust, player loses, no matter what happens to dealer
- Blackjack only happens after initial draw. You only get blackjack if you get 21 with 2 cards in hand.

### Output

- Represent the suites with H | S | C | D and the value with the same string you received from the shuffle endpoint. So a 7 of spades is represented as S7
- Print who won the game prefixed with Winner:
- Newline
- Dealer’s name, score and hand separated with ‘|’, so Dealer | `<score>` | S7,S10,CJ
- Then print your name, your score and your hand separated with ‘|’, so Ivar | `<score>` | D2,H2,C6,H9

Example full output:

```text
Winner: Ivar
Dealer | 27 | S7,S10,CJ
Ivar | 19 | D2,H2,C6,H9
```

## Notes

- We’d like to see tests for your logic.

## Deliverables

- NOTE: If you use AI, please include your full conversation history with the agent in the repository in an AI_CONVERSATION.md file.
- A github or gitlab repo containing your code, tests and instructions for how to build/run the project
- Please submit your solution in Typescript, as it’s the primary language of our stack
- For Github, access should be granted to users:
  - chriswk
  - ivarconr
  - fredrikoseberg
  - sighphyre
  - gastonfournier
  - kwasniew
  - sjaanus
  - nunogois
- For Gitlab, access should be granted to users:
  - chriswk
  - ivarconr
  - fredrikoseberg
  - gastonfournier
